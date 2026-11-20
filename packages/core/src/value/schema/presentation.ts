export type GraphSchemaPresentation = {
  booleanLabels?: {
    true?: string;
    false?: string;
    unset?: string;
  };
  control?: 'text' | 'textarea' | 'password' | 'email' | 'url';
};
