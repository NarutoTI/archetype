export interface Task {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  /** Epoch em milissegundos, definido pelo backend. */
  createdAt: number;
  /** Epoch em milissegundos, definido pelo backend. */
  updatedAt: number;
}
