import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IonicVue } from '@ionic/vue';
import { createI18n } from 'vue-i18n';
import TasksPage from '@/views/TasksPage.vue';

const taskStoreMock = vi.hoisted(() => ({
  tasks: [] as Array<{ id: string; title: string; dueDate: string; completed: boolean }>,
  pendingTasks: [] as Array<{ id: string; title: string; dueDate: string; completed: boolean }>,
  completedTasks: [] as Array<{ id: string; title: string; dueDate: string; completed: boolean }>,
  upcomingCount: 0,
  isLoading: false,
  initialize: vi.fn(async () => {}),
  loadAllFromServer: vi.fn(async () => []),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  toggleTaskCompleted: vi.fn(),
  removeTask: vi.fn(),
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => taskStoreMock,
}));

const i18n = createI18n({
  legacy: false,
  locale: 'pt',
  messages: {
    pt: {
      tasks: {
        title: 'Tarefas',
        empty: 'Nenhuma tarefa ainda.',
        emptyHint: 'Toque em + para criar sua primeira tarefa.',
        pending: 'Pendentes',
        completed: 'Concluídas',
        upcoming: '{count} a vencer',
        remove: 'Remover tarefa',
        new: 'Nova tarefa',
        edit: 'Editar tarefa',
        taskTitle: 'Título',
        taskPlaceholder: 'Ex.: Comprar pão',
        dueDate: 'Data',
      },
      common: {
        edit: 'Editar',
        delete: 'Excluir',
        cancel: 'Cancelar',
        save: 'Salvar',
      },
    },
  },
});

vi.mock('@/utils/date.utils', () => ({
  dateToISOString: vi.fn(() => '2026-06-10'),
  formatISODateToLocalString: vi.fn((date: string) => date),
}));

vi.mock('@/services/alert.service', () => ({
  alertService: {
    presentAlertConfirmDanger: vi.fn(),
  },
}));

vi.mock('@/services/toast.service', () => ({
  toastService: {
    presentToastError: vi.fn(),
  },
}));

vi.mock('@/services/errorTranslation.service', () => ({
  ErrorTranslationService: {
    translateError: vi.fn(() => 'error'),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('TasksPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    taskStoreMock.tasks = [];
    taskStoreMock.pendingTasks = [];
    taskStoreMock.completedTasks = [];
    taskStoreMock.upcomingCount = 0;
    taskStoreMock.isLoading = false;
  });

  const mountPage = () => mount(TasksPage, {
    global: {
      plugins: [IonicVue, i18n],
      stubs: {
        EmptyState: {
          template: '<div class="empty-state"><slot />{{ title }}</div>',
          props: ['icon', 'title', 'subtitle'],
        },
        DateTime: true,
      },
    },
  });

  it('mounts and initializes the task store on load', async () => {
    mountPage();
    await Promise.resolve();

    expect(taskStoreMock.initialize).toHaveBeenCalledOnce();
  });

  it('renders the empty state when there are no tasks', async () => {
    const wrapper = mountPage();
    await Promise.resolve();

    expect(wrapper.text()).toContain('Tarefas');
    expect(wrapper.find('.empty-state').text()).toContain('Nenhuma tarefa ainda.');
  });

  it('renders pending tasks returned by the store', async () => {
    taskStoreMock.tasks = [
      { id: '1', title: 'Comprar pão', dueDate: '2026-06-20', completed: false },
    ];
    taskStoreMock.pendingTasks = taskStoreMock.tasks;
    taskStoreMock.upcomingCount = 1;

    const wrapper = mountPage();
    await Promise.resolve();

    expect(wrapper.text()).toContain('Comprar pão');
    expect(wrapper.text()).toContain('Pendentes');
  });
});
