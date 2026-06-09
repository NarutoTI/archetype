export interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
  provider: string;
  isDevelopment?: boolean;
  language?: string;
  birthDate?: string;
  phone?: string;
}
