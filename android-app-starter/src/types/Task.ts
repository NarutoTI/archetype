export interface Task {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
  /** Epoch milliseconds, set by the backend. */
  createdAt: number;
}
