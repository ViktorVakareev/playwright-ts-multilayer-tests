import { randomUUID } from 'node:crypto';
import { settings } from '../settings.js';
import type { CreateServiceRequest } from '../api/types.js';

/**
 * Test data builder: readable defaults, override only what the test is about.
 *   aServiceRequest().withAmount(5000.01).build()
 * Titles are unique per call so parallel workers never collide.
 */
export class ServiceRequestBuilder {
  private data: CreateServiceRequest = {
    customerId: settings.activeCustomerId,
    title: `QA auto ${randomUUID().slice(0, 12)}`,
    amount: 100,
  };

  forCustomer(customerId: number): this { this.data.customerId = customerId; return this; }
  withTitle(title: string): this { this.data.title = title; return this; }
  withAmount(amount: number): this { this.data.amount = amount; return this; }
  /** Above the 5,000.00 threshold, so it needs approval. */
  needingApproval(): this { return this.withAmount(7500); }

  build(): CreateServiceRequest { return { ...this.data }; }
}

export const aServiceRequest = () => new ServiceRequestBuilder();
