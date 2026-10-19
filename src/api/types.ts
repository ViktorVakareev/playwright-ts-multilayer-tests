// DTOs mirror the API's JSON contract.
export type RequestStatus = 'PendingApproval' | 'Approved' | 'Rejected' | 'Fulfilled';

export interface CreateServiceRequest {
  customerId: number;
  title: string;
  amount: number;
}

export interface ServiceRequest {
  id: number;
  customerId: number;
  title: string;
  amount: number;
  status: RequestStatus;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: number;
  requestId: number;
  net: number;
  vat: number;
  gross: number;
}

export interface ApiError {
  error: string;
}

/** Status code plus parsed body; tests assert on both. */
export interface ApiResult<T> {
  status: number;
  headers: Record<string, string>;
  body: T;
}
