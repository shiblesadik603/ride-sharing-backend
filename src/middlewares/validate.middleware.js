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
    // Express 5 made req.query a getter-only accessor — `req.query = ...`
    // throws. Redefining the property is the supported way to still swap
    // in the coerced/defaulted object Zod produced.
    if (parsed.query) {
      Object.defineProperty(req, "query", {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    if (parsed.params) req.params = parsed.params;

    next();
  };
}
