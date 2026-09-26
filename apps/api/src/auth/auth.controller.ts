import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Post, Body , HttpCode, HttpStatus, } from '@nestjs/common';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { type LoginResponse, type LoginRequest } from '@rms/api-contract';
import { loginRequestSchema } from '@rms/api-contract';
import { type RegisterRequest, type RegisterResponse } from '@rms/api-contract';
import { registerRequestSchema } from '@rms/api-contract';

@ApiTags('authentication')
@Controller('auth') 
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('register')
    @ApiOperation({
        summary: 'Register user',
        description: 'Creates a new user account.',
    })
    register(
        @Body(new ZodValidationPipe(registerRequestSchema))
        body: RegisterRequest,
    ): Promise<RegisterResponse> {
        return this.authService.register(body);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Login user',
        description: 'Authenticates a user using their email and password.',
    })
    login(
        @Body(new ZodValidationPipe(loginRequestSchema))
        body: LoginRequest,
    ): Promise<LoginResponse> { 
        return this.authService.login(body);
    }


} 
