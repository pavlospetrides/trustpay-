/** Levenshtein character error rate; callers supply independent reference text. */
export function scoreChecks(checks: boolean[]): { correct: number; total: number } {
  return { correct: checks.filter(Boolean).length, total: checks.length };
}

export function characterErrorRate(reference: string, observed: string): { edits: number; reference_characters: number; rate: number | null } {
  const wanted = [...reference];
  const actual = [...observed];
  if (wanted.length > 5_000 || actual.length > 5_000) throw new Error("OCR comparison exceeds 5,000 characters");
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= wanted.length; row++) {
    const current = [row];
    for (let column = 1; column <= actual.length; column++) current.push(Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (wanted[row - 1] === actual[column - 1] ? 0 : 1)));
    previous = current;
  }
  const edits = previous[actual.length];
  return { edits, reference_characters: wanted.length, rate: wanted.length ? edits / wanted.length : null };
}
