import { ApiError } from "../utils/ApiError.js"

/**
 * Validates and sanitises request parts against a Zod schema.
 * Usage: validate({ body: schema, params: schema, query: schema })
 * Replaces req.body/params/query with the parsed (typed, stripped) values.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {})
      if (schemas.params) req.params = schemas.params.parse(req.params ?? {})
      if (schemas.query) req.query = schemas.query.parse(req.query ?? {})
      next()
    } catch (err) {
      const details = err?.errors?.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }))
      next(ApiError.badRequest("Validation failed", details))
    }
  }
}
