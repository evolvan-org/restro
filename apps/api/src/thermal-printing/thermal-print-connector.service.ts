import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ThermalConnectorCommand,
  ThermalConnectorReply,
  ThermalConnectorStatus,
  ThermalConnectorTarget,
} from '@rms/api-contract';
import type { Response } from 'express';

import { ThermalPrintingRepository } from './thermal-printing.repository';

type PendingJob = {
  complete: (ok: boolean) => void;
  cancel: () => void;
};

type Connection = {
  tokenHash: string;
  response: Response;
  jobs: Map<string, PendingJob>;
};

const MAX_JOB_BYTES = 256 * 1024;
const JOB_TIMEOUT_MS = 12_000;
const MAX_PENDING_JOBS = 4;
const HEARTBEAT_MS = 20_000;

@Injectable()
export class ThermalPrintConnectorService {
  private readonly connections = new Map<string, Connection>();
  private readonly busy = new Set<string>();

  constructor(private readonly repository: ThermalPrintingRepository) {}

  async status(restaurantId: string): Promise<ThermalConnectorStatus> {
    const hash = await this.repository.connectorHash(restaurantId);
    const connection = this.connections.get(restaurantId);
    return {
      paired: hash !== null,
      online:
        hash !== null &&
        connection?.tokenHash === hash &&
        !connection.response.writableEnded &&
        !connection.response.destroyed,
    };
  }

  async rotate(restaurantId: string): Promise<{ token: string }> {
    const token = randomBytes(32).toString('base64url');
    await this.repository.setConnector(restaurantId, hashToken(token));
    this.connections.get(restaurantId)?.response.end();
    return { token };
  }

  async revoke(restaurantId: string): Promise<void> {
    await this.repository.setConnector(restaurantId, null);
    this.connections.get(restaurantId)?.response.end();
  }

  async connect(authorization: string | undefined, response: Response): Promise<void> {
    const { restaurantId, tokenHash } = await this.authenticate(authorization);
    if (response.destroyed) return;
    const existing = this.connections.get(restaurantId);
    if (existing && !existing.response.writableEnded && !existing.response.destroyed) {
      if (existing.tokenHash === tokenHash)
        throw new ConflictException('A print connector is already connected for this restaurant');
      existing.response.end();
    }
    const connection: Connection = { tokenHash, response, jobs: new Map() };
    this.connections.set(restaurantId, connection);
    const heartbeat = setInterval(() => {
      if (!response.write('\n')) response.destroy();
    }, HEARTBEAT_MS);
    response.once('close', () => {
      clearInterval(heartbeat);
      if (this.connections.get(restaurantId) === connection) this.connections.delete(restaurantId);
      for (const job of connection.jobs.values()) job.cancel();
    });
    response.status(200).set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    response.write('\n');
  }

  async reply(authorization: string | undefined, reply: ThermalConnectorReply): Promise<void> {
    const { restaurantId, tokenHash } = await this.authenticate(authorization);
    const connection = this.connections.get(restaurantId);
    if (connection?.tokenHash === tokenHash) connection.jobs.get(reply.id)?.complete(reply.ok);
  }

  async dispatch(
    restaurantId: string,
    target: ThermalConnectorTarget,
    data?: Buffer,
  ): Promise<void> {
    const tokenHash = await this.repository.connectorHash(restaurantId);
    const connection = this.connections.get(restaurantId);
    if (
      !connection ||
      connection.tokenHash !== tokenHash ||
      connection.response.writableEnded ||
      connection.response.destroyed
    ) {
      throw new ServiceUnavailableException('Connect this restaurant’s print connector first');
    }
    if (connection.jobs.size >= MAX_PENDING_JOBS)
      throw new ServiceUnavailableException(
        'The connector is busy. Try again after the current jobs.',
      );
    if (data && data.length > MAX_JOB_BYTES)
      throw new ServiceUnavailableException('This print job is too large for the connector');
    const targetKey =
      target.transport === 'usb' ? target.device : target.network.host + ':' + target.network.port;
    const key = restaurantId + ':' + targetKey;
    if (this.busy.has(key))
      throw new ServiceUnavailableException(
        'The printer is busy. Try again after the current job.',
      );
    this.busy.add(key);
    try {
      const id = randomUUID();
      const command: ThermalConnectorCommand = {
        id,
        target,
        expiresAt: Date.now() + JOB_TIMEOUT_MS - 4000,
        ...(data && { data: data.toString('base64') }),
      };
      await new Promise<void>((resolve, reject) => {
        const finish = (ok: boolean, message: string): void => {
          clearTimeout(timer);
          connection.jobs.delete(id);
          if (ok) resolve();
          else reject(new ServiceUnavailableException(message));
        };
        const cancel = () =>
          finish(
            false,
            'The connector did not confirm delivery. Check the printer before retrying.',
          );
        const timer = setTimeout(cancel, JOB_TIMEOUT_MS);
        connection.jobs.set(id, {
          complete: (ok) =>
            finish(
              ok,
              'The connector could not complete this request. Check the printer and connector.',
            ),
          cancel,
        });
        try {
          connection.response.write(JSON.stringify(command) + '\n', (error?: Error | null) => {
            if (error) cancel();
          });
        } catch {
          cancel();
        }
      });
    } finally {
      this.busy.delete(key);
    }
  }

  private async authenticate(authorization: string | undefined): Promise<{
    restaurantId: string;
    tokenHash: string;
  }> {
    const token = /^Bearer ([a-zA-Z0-9_-]{43})$/i.exec(authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Print connector credential required');
    const tokenHash = hashToken(token);
    const owner = await this.repository.connectorOwner(tokenHash);
    if (!owner) throw new UnauthorizedException('Print connector credential is invalid or revoked');
    return { restaurantId: owner.restaurantId, tokenHash };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
