export function renderTemplate(
  template: string,
  input: string,
  stepOutputs: string[],
): string {
  let out = template.replace(/\{input\}/g, input);
  // {step_N_output} where N is 1-indexed
  out = out.replace(/\{step_(\d+)_output\}/g, (_, n: string) => {
    const idx = Number.parseInt(n, 10) - 1;
    return stepOutputs[idx] ?? "";
  });
  return out;
}
