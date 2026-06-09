import api from '@/services/api.service';
import type { User } from '@/types/User';
import { ErrorTranslationService } from '@/services/errorTranslation.service';

class UserService {
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const response = await api.get<User>(`/users/${encodeURIComponent(email)}`);
      return response.data;
    } catch (error) {
      throw new Error(ErrorTranslationService.translateError(error));
    }
  }

  async updateUserProfile(userId: string, updates: Partial<User>): Promise<User> {
    try {
      const response = await api.put<User>(`/users/${userId}`, updates);
      return response.data;
    } catch (error) {
      throw new Error(ErrorTranslationService.translateError(error));
    }
  }
}

export const userService = new UserService();
