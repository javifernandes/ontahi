export type TodoAuthenticationMode = 'disabled' | 'github';

export const resolveTodoAuthenticationMode = (
  value = process.env.TODO_AUTH_MODE,
): TodoAuthenticationMode => {
  const mode = value ?? 'disabled';

  if (mode !== 'disabled' && mode !== 'github') {
    throw new Error(`Unsupported TODO_AUTH_MODE ${JSON.stringify(mode)}. Use disabled or github.`);
  }

  return mode;
};

export const todoAuthenticationMode = resolveTodoAuthenticationMode();
