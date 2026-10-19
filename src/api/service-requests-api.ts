import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { ApiError, ApiResult, CreateServiceRequest, Invoice, ServiceRequest } from './types.js';

/**
 * Thin client over Playwright's APIRequestContext.
 * Never throws on 4xx/5xx: negative tests need those responses.
 */
export class ServiceRequestsApi {
  constructor(private readonly request: APIRequestContext) {}

  create(body: CreateServiceRequest): Promise<ApiResult<ServiceRequest & ApiError>> {
    return this.send(this.request.post('/api/requests', { data: body }));
  }

  get(id: number): Promise<ApiResult<ServiceRequest & ApiError>> {
    return this.send(this.request.get(`/api/requests/${id}`));
  }

  approve(id: number): Promise<ApiResult<ServiceRequest & ApiError>> {
    return this.send(this.request.post(`/api/requests/${id}/approve`));
  }

  reject(id: number, reason: string): Promise<ApiResult<ServiceRequest & ApiError>> {
    return this.send(this.request.post(`/api/requests/${id}/reject`, { data: { reason } }));
  }

  fulfil(id: number): Promise<ApiResult<ServiceRequest & ApiError>> {
    return this.send(this.request.post(`/api/requests/${id}/fulfil`));
  }

  invoiceFor(requestId: number): Promise<ApiResult<Invoice & ApiError>> {
    return this.send(this.request.get(`/api/invoices/by-request/${requestId}`));
  }

  /** Arrange helper: creates a request and fails fast unless the API returned 201. */
  async createOrThrow(body: CreateServiceRequest): Promise<ServiceRequest> {
    const result = await this.create(body);
    if (result.status !== 201) {
      throw new Error(`Arrange failed: POST /api/requests returned ${result.status}: ${JSON.stringify(result.body)}`);
    }
    return result.body;
  }

  /** Arrange helper: a request already in the Approved state. */
  async createApproved(body: CreateServiceRequest): Promise<ServiceRequest> {
    const created = await this.createOrThrow(body);
    if (created.status === 'Approved') {
      return created;
    }
    const approved = await this.approve(created.id);
    if (approved.status !== 200) {
      throw new Error(`Arrange failed: approve returned ${approved.status}`);
    }
    return approved.body;
  }

  private async send<T>(call: Promise<APIResponse>): Promise<ApiResult<T>> {
    const response = await call;
    const text = await response.text();
    return {
      status: response.status(),
      headers: response.headers(),
      body: (text ? JSON.parse(text) : null) as T,
    };
  }
}
