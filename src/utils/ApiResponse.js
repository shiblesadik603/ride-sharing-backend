/**
 * Consistent success envelope for every endpoint, so API consumers never
 * have to guess the response shape per-route.
 */
export class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
}
