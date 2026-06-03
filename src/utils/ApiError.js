export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message)
    this.statusCode = statusCode
    this.details = details
    this.isApiError = true
  }

  static badRequest(message = "Bad request", details) {
    return new ApiError(400, message, details)
  }
  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, message)
  }
  static forbidden(message = "Forbidden") {
    return new ApiError(403, message)
  }
  static notFound(message = "Not found") {
    return new ApiError(404, message)
  }
  static conflict(message = "Conflict") {
    return new ApiError(409, message)
  }
}
