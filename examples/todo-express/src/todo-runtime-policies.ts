import { todoGraphCommandPolicies } from './todo-command-policies.js';
import { todoGraphReadPolicies, type TodoGraphReadAuthority } from './todo-read-policies.js';

export type TodoRuntimeAuthority = TodoGraphReadAuthority;

export const todoRuntimePolicies = [...todoGraphReadPolicies, ...todoGraphCommandPolicies] as const;
