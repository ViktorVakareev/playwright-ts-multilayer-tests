import { expect, type Locator, type Page } from '@playwright/test';
import type { RequestStatus } from '../api/types.js';

/**
 * Page object for the single-page Service Requests UI.
 * Locators use data-testid (getByTestId), the most stable option.
 */
export class ServiceRequestsPage {
  readonly formError: Locator;
  private readonly customer: Locator;
  private readonly title: Locator;
  private readonly amount: Locator;
  private readonly submit: Locator;
  private readonly createdId: Locator;

  constructor(private readonly page: Page) {
    this.customer = page.getByTestId('customer-select');
    this.title = page.getByTestId('title-input');
    this.amount = page.getByTestId('amount-input');
    this.submit = page.getByTestId('submit-button');
    this.createdId = page.getByTestId('created-id');
    this.formError = page.getByTestId('form-error');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
    // The customer list is loaded by JavaScript; wait until it has options.
    await expect(this.customer.locator('option').first()).toBeAttached();
  }

  async submitForm(customerId: number, title: string, amount: string): Promise<void> {
    await this.customer.selectOption(String(customerId));
    await this.title.fill(title);
    await this.amount.fill(amount);
    await this.submit.click();
  }

  /** Submits the form and returns the new request id shown on the page. */
  async create(customerId: number, title: string, amount: number): Promise<number> {
    const previous = await this.createdId.innerText();
    await this.submitForm(customerId, title, amount.toFixed(2));
    // Wait for a *new* id: right after submit the label still shows the previous one.
    await expect(this.createdId).toHaveText(/^\d+$/);
    await expect(this.createdId).not.toHaveText(previous || '__none__');
    return Number(await this.createdId.innerText());
  }

  status(requestId: number): Locator { return this.page.getByTestId(`status-${requestId}`); }
  approveButton(requestId: number): Locator { return this.page.getByTestId(`approve-${requestId}`); }
  fulfilButton(requestId: number): Locator { return this.page.getByTestId(`fulfil-${requestId}`); }

  async expectStatus(requestId: number, status: RequestStatus): Promise<void> {
    await expect(this.status(requestId)).toHaveText(status);
  }
}
