/**
 * Validates req.{body,query,params} against a Zod schema shaped as
 * `{ body?, query?, params? }` and replaces each with its parsed (and
 * coerced/transformed — trimmed, lowercased, etc.) value. Throws
 * synchronously on failure; Express's router catches that and forwards to
 * the global error handler, which already knows how to format a ZodError.
 */
export function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (parsed.body) req.body = parsed.body;
    if (parsed.query) req.query = parsed.query;
    if (parsed.params) req.params = parsed.params;

    next();
  };
}
