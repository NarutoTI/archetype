import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useUserStore } from '@/stores/userStore';
import { bootReadyPromise } from '@/services/boot';

const requireAuth = async () => {
  await bootReadyPromise;
  const userStore = useUserStore();
  return userStore.isAuthenticated ? true : '/login';
};

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/tabs/tasks',
  },
  {
    path: '/home',
    redirect: '/tabs/tasks',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginPage.vue'),
    beforeEnter: async () => {
      await bootReadyPromise;
      return useUserStore().isAuthenticated ? '/tabs/tasks' : true;
    },
  },
  {
    path: '/reset-password',
    name: 'ResetPassword',
    component: () => import('@/views/ResetPasswordPage.vue'),
  },
  {
    path: '/auth/callback',
    name: 'AuthCallback',
    component: () => import('@/views/AuthCallbackPage.vue'),
  },
  {
    path: '/delete-instructions',
    name: 'DeleteInstructions',
    component: () => import('@/views/DeleteInstructionsPage.vue'),
  },
  {
    path: '/tabs',
    component: () => import('@/views/HomePage.vue'),
    beforeEnter: requireAuth,
    children: [
      { path: '', redirect: '/tabs/tasks' },
      { path: 'tasks', name: 'Tasks', component: () => import('@/views/TasksPage.vue') },
      { path: 'media', name: 'Media', component: () => import('@/views/MediaPage.vue') },
      { path: 'notifications', name: 'Notifications', component: () => import('@/views/NotificationsPage.vue') },
      { path: 'menu', name: 'Menu', component: () => import('@/views/MenuView.vue') },
      { path: 'delete-account', name: 'DeleteAccount', component: () => import('@/views/DeleteAccountView.vue') },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async () => {
  await bootReadyPromise;
});

export default router;
