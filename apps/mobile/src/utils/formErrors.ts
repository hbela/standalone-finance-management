export function hasFieldError(errors: unknown[]) {
  return errors.length > 0;
}

export function getFieldError(errors: unknown[]) {
  const first = errors[0];
  if (first && typeof first === "object" && "message" in first) {
    return String(first.message);
  }
  return typeof first === "string" ? first : "Invalid value.";
}
