import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLocalDate,
  createLocalDateTime,
  dateTimeToLocaleString,
  dateToISOString,
  dateToISOStringWithTime,
  dateToLocaleString,
  formatDateTimeToLocalString,
  formatISODateToLocalString,
  formatTime,
  getTime,
  isPastDate,
  isPastDateTime,
  isSameOrFutureDate,
} from '@/utils/date.utils';

// Espelha isSameOrFutureDateTime do my-memories (não exportada no archetype).
const isSameOrFutureDateTime = (date: string, time?: string) => !isPastDateTime(date, time);

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: vi.fn((key: string) => {
        const translations: Record<string, string> = {
          'common.locale': 'pt-BR',
        };
        return translations[key] || key;
      }),
    },
  },
}));

describe('date.utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mock de tempo e timezone', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe('horário específico', () => {
      it('compara isPastDateTime com horário atual mockado', () => {
        vi.setSystemTime(new Date(2025, 0, 15, 10, 30, 0));

        const todayISO = '2025-01-15';

        expect(isPastDateTime(todayISO, '09:00')).toBe(true);
        expect(isSameOrFutureDateTime(todayISO, '09:00')).toBe(false);

        expect(isPastDateTime(todayISO, '10:30')).toBe(false);
        expect(isSameOrFutureDateTime(todayISO, '10:30')).toBe(true);

        expect(isPastDateTime(todayISO, '11:00')).toBe(false);
        expect(isSameOrFutureDateTime(todayISO, '11:00')).toBe(true);

        // Sem horário usa 00:00, que já passou às 10:30.
        expect(isPastDateTime(todayISO)).toBe(true);
        expect(isSameOrFutureDateTime(todayISO)).toBe(false);
      });

      it('trata corretamente o início do dia', () => {
        vi.setSystemTime(new Date(2025, 0, 15, 0, 5, 0));

        const todayISO = '2025-01-15';

        expect(isPastDateTime(todayISO)).toBe(true);
        expect(isSameOrFutureDateTime(todayISO)).toBe(false);
        expect(isPastDateTime(todayISO, '00:05')).toBe(false);
        expect(isSameOrFutureDateTime(todayISO, '00:05')).toBe(true);
        expect(isPastDateTime(todayISO, '00:04')).toBe(true);
        expect(isSameOrFutureDateTime(todayISO, '00:04')).toBe(false);
      });

      it('cobre mudança de dia perto da meia-noite', () => {
        vi.setSystemTime(new Date(2024, 11, 31, 23, 58, 0));

        expect(isPastDateTime('2024-12-31', '23:59')).toBe(false);
        expect(isSameOrFutureDateTime('2025-01-01', '00:00')).toBe(true);
        expect(isPastDateTime('2024-12-30', '23:59')).toBe(true);
      });
    });

    describe('fuso local (calendário)', () => {
      it('mantém o dia civil correto com createLocalDate e dateToISOString', () => {
        vi.setSystemTime(new Date(2025, 0, 15, 14, 30, 0));

        const now = new Date();
        expect(now.getHours()).toBe(14);
        expect(now.getMinutes()).toBe(30);

        const todayISO = dateToISOString(now);
        expect(todayISO).toBe('2025-01-15');

        expect(isPastDateTime(todayISO, '14:29')).toBe(true);
        expect(isPastDateTime(todayISO, '14:30')).toBe(false);
        expect(isSameOrFutureDateTime(todayISO, '14:30')).toBe(true);
      });

      it('compara horários no mesmo dia civil em março', () => {
        vi.setSystemTime(new Date(2025, 2, 15, 15, 45, 0));

        const todayISO = dateToISOString(new Date());
        expect(todayISO).toBe('2025-03-15');
        expect(isPastDateTime(todayISO, '15:44')).toBe(true);
        expect(isPastDateTime(todayISO, '15:45')).toBe(false);
      });
    });

    describe('entrada UTC convertida para horário local', () => {
      it('usa o dia local ao mockar instante UTC', () => {
        vi.setSystemTime(new Date('2025-01-15T17:30:00Z'));

        const now = new Date();
        const todayISO = dateToISOString(now);
        expect(todayISO).toBe('2025-01-15');

        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hour}:${minute}`;

        expect(isPastDateTime(todayISO, currentTime)).toBe(false);
        expect(isSameOrFutureDate(todayISO)).toBe(true);
        expect(isSameOrFutureDate('2025-01-14')).toBe(false);
        expect(isSameOrFutureDate('2025-01-16')).toBe(true);
      });

      it('formata data e hora mockadas para exibição local', () => {
        vi.setSystemTime(new Date(2025, 11, 25, 9, 15, 0));

        const now = new Date();
        expect(formatISODateToLocalString(dateToISOString(now))).toMatch(/25\/12\/2025/);

        const dateTimeFormatted = formatDateTimeToLocalString('2025-12-25', '09:15');
        expect(dateTimeFormatted).toContain('25');
        expect(dateTimeFormatted).toContain('2025');
        expect(dateTimeFormatted).toContain('09');
        expect(dateTimeFormatted).toContain('15');
      });
    });

    describe('bordas temporais', () => {
      it('trata exatamente a meia-noite', () => {
        vi.setSystemTime(new Date(2025, 0, 15, 0, 0, 0));

        const todayISO = '2025-01-15';

        expect(isPastDateTime(todayISO, '00:00')).toBe(false);
        expect(isSameOrFutureDateTime(todayISO, '00:00')).toBe(true);
        expect(isPastDateTime(todayISO)).toBe(false);
        expect(isSameOrFutureDateTime(todayISO)).toBe(true);
        expect(isPastDateTime(todayISO, '12:00')).toBe(false);
        expect(isPastDateTime(todayISO, '23:59')).toBe(false);
      });

      it('trata um minuto antes da meia-noite', () => {
        vi.setSystemTime(new Date(2025, 0, 14, 23, 59, 0));

        expect(isPastDateTime('2025-01-14', '23:59')).toBe(false);
        expect(isSameOrFutureDateTime('2025-01-15', '00:00')).toBe(true);
      });

      it('compara datas civis com relógio mockado', () => {
        vi.setSystemTime(new Date(2025, 0, 15, 16, 45, 0));

        const todayISO = dateToISOString(new Date());

        expect(isSameOrFutureDate(todayISO)).toBe(true);
        expect(isSameOrFutureDate('2025-01-14')).toBe(false);
        expect(isSameOrFutureDate('2025-01-16')).toBe(true);
      });
    });

    describe('instante absoluto em outro offset', () => {
      it('respeita a conversão do relógio local ao mockar ISO com offset', () => {
        vi.setSystemTime(new Date('2025-01-15T12:00:00-05:00'));

        const now = new Date();
        const todayISO = dateToISOString(now);
        expect(todayISO).toBe('2025-01-15');

        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${hour}:${minute}`;
        const current = createLocalDateTime(todayISO, currentTime);
        const beforeTime = (() => {
          const before = new Date(current.getTime() - 60_000);
          return `${String(before.getHours()).padStart(2, '0')}:${String(before.getMinutes()).padStart(2, '0')}`;
        })();
        const afterTime = (() => {
          const after = new Date(current.getTime() + 60_000);
          return `${String(after.getHours()).padStart(2, '0')}:${String(after.getMinutes()).padStart(2, '0')}`;
        })();

        expect(isPastDateTime(todayISO, currentTime)).toBe(false);
        expect(isPastDateTime(todayISO, beforeTime)).toBe(true);
        expect(isPastDateTime(todayISO, afterTime)).toBe(false);
      });
    });
  });

  describe('createLocalDate', () => {
    it('cria data local a partir de YYYY-MM-DD', () => {
      const date = createLocalDate('2025-01-15');

      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(0);
      expect(date.getDate()).toBe(15);
    });

    it('não sofre com timezone na string de calendário', () => {
      expect(createLocalDate('2025-01-01').toLocaleDateString('pt-BR')).toBe('01/01/2025');
    });

    it('retorna Invalid Date para string não numérica', () => {
      expect(isNaN(createLocalDate('invalid-date').getTime())).toBe(true);
    });

    it('normaliza overflow de mês/dia como o construtor Date local', () => {
      // Diferente de validação estrita: o engine JS ajusta 2025-13-40 para uma data válida.
      expect(isNaN(createLocalDate('2025-13-40').getTime())).toBe(false);
    });
  });

  describe('createLocalDateTime', () => {
    it('combina data e hora no fuso local', () => {
      const date = createLocalDateTime('2026-06-10', '14:30');

      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(5);
      expect(date.getDate()).toBe(10);
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
      expect(date.getSeconds()).toBe(0);
    });
  });

  describe('dateToISOString', () => {
    it('converte Date para YYYY-MM-DD', () => {
      expect(dateToISOString(new Date(2025, 0, 15))).toBe('2025-01-15');
    });

    it('usa locale sv-SE para garantir o formato ISO', () => {
      const isoString = dateToISOString(new Date(2025, 11, 31));
      expect(isoString).toBe('2025-12-31');
      expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getTime e dateToISOStringWithTime', () => {
    it('formata hora e datetime técnico', () => {
      const date = new Date(2026, 5, 10, 9, 5, 7);

      expect(getTime(date)).toBe('09:05:07');
      expect(dateToISOStringWithTime(date)).toBe('2026-06-10T09:05:07');
    });
  });

  describe('formatação local', () => {
    it('formata data civil para exibição', () => {
      const formatted = dateToLocaleString(createLocalDate('2025-01-15'));
      expect(formatted).toContain('2025');
      expect(formatted).toContain('15');
    });

    it('converte string ISO para formato local', () => {
      expect(formatISODateToLocalString('2025-01-15')).toMatch(/15\/01\/2025/);
      expect(formatISODateToLocalString('2025-01-01')).toMatch(/01\/01\/2025/);
    });

    it('formata data e hora juntas', () => {
      const formatted = formatDateTimeToLocalString('2025-01-15', '14:30');

      expect(formatted).toContain('2025');
      expect(formatted).toContain('15');
      expect(formatted).toContain('14');
      expect(formatted).toContain('30');
      expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('retorna string vazia para datetime ausente', () => {
      expect(dateTimeToLocaleString(undefined)).toBe('');
    });
  });

  describe('formatTime', () => {
    it('mantém hora e minuto', () => {
      expect(formatTime('09:30')).toBe('09:30');
      expect(formatTime('14:45')).toBe('14:45');
    });

    it('aceita formato incompleto', () => {
      expect(formatTime('9:5')).toBe('9:5');
    });

    it('não lança erro com entrada inválida', () => {
      expect(formatTime('invalid')).toBe('invalid:undefined');
      expect(formatTime('')).toBe(':undefined');
    });
  });

  describe('isSameOrFutureDate', () => {
    it('retorna true para hoje', () => {
      const todayISO = dateToISOString(new Date());
      expect(isSameOrFutureDate(todayISO)).toBe(true);
    });

    it('retorna true para data futura', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isSameOrFutureDate(dateToISOString(tomorrow))).toBe(true);
    });

    it('retorna false para data passada', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isSameOrFutureDate(dateToISOString(yesterday))).toBe(false);
    });

    it('retorna false para data inválida', () => {
      expect(isSameOrFutureDate('2025-13-40')).toBe(false);
      expect(isSameOrFutureDate('invalid-date')).toBe(false);
    });
  });

  describe('isPastDateTime', () => {
    it('retorna false para data e hora futuras', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isPastDateTime(dateToISOString(tomorrow), '00:00')).toBe(false);
      expect(isSameOrFutureDateTime(dateToISOString(tomorrow))).toBe(true);
    });

    it('retorna true para ontem', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isPastDateTime(dateToISOString(yesterday), '23:59')).toBe(true);
    });

    it('compara horário no dia atual', () => {
      const todayISO = dateToISOString(new Date());

      expect(isPastDateTime(todayISO, '23:59')).toBe(false);
      expect(isSameOrFutureDateTime(todayISO, '23:59')).toBe(true);
      expect(isPastDateTime(todayISO, '00:00')).toBe(true);
      expect(isSameOrFutureDateTime(todayISO, '00:00')).toBe(false);
    });
  });

  describe('isPastDate', () => {
    it('compara instâncias Date com o relógio atual', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 10, 14, 30, 0));

      expect(isPastDate(new Date(2026, 5, 10, 14, 29, 59))).toBe(true);
      expect(isPastDate(new Date(2026, 5, 10, 14, 30, 0))).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('integração', () => {
    it('percorre workflow de criar, serializar e formatar', () => {
      const targetDate = '2025-06-15';
      const localDate = createLocalDate(targetDate);
      const formattedISO = dateToISOString(localDate);
      const formattedLocal = formatISODateToLocalString(formattedISO);

      expect(formattedISO).toBe(targetDate);
      expect(formattedLocal).toMatch(/15\/06\/2025/);
    });

    it('mantém coerência entre comparação de data e datetime em dias passados/futuros', () => {
      // "Hoje" não entra: isSameOrFutureDate usa meia-noite de hoje, isPastDateTime sem hora usa 00:00 do dia.
      const cases = [
        { date: '2023-01-01', sameOrFuture: false },
        { date: '2030-12-31', sameOrFuture: true },
      ];

      cases.forEach(({ date, sameOrFuture }) => {
        expect(isSameOrFutureDate(date)).toBe(sameOrFuture);
        expect(isPastDateTime(date)).toBe(!sameOrFuture);
      });
    });
  });
});
