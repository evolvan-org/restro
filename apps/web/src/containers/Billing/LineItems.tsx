import type { Bill } from '@rms/api-contract';
import type { ReactElement } from 'react';

import styles from './line-items.module.css';

export default function LineItems({ lines }: { lines: Bill['lines'] }): ReactElement {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className={styles.quantity}>
              Qty
            </th>
            <th scope="col" className={styles.unitPrice}>
              Unit price
            </th>
            <th scope="col" className={styles.amount}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td className={styles.name}>
                <span>{line.name}</span>
                <span className={styles.mobileMeta}>
                  {line.quantity} × {line.unitPrice}
                </span>
              </td>
              <td className={styles.quantity}>{line.quantity}</td>
              <td className={styles.unitPrice}>{line.unitPrice}</td>
              <td className={styles.amount}>{line.amount}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={4} className={styles.empty}>
                No active order items.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
