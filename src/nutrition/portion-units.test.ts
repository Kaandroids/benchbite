import de from '@/i18n/locales/de.json';
import en from '@/i18n/locales/en.json';
import tr from '@/i18n/locales/tr.json';
import { Constants } from '@/lib/database.types';

const LOCALES = { en, de, tr };

describe('portion units', () => {
  it.each(Object.entries(LOCALES))(
    'are named in %s for every unit the database knows, counted and alone',
    (_language, locale) => {
      for (const unit of Constants.public.Enums.portion_unit) {
        const counted = locale.nutrition.units as Record<string, string>;
        expect(counted[`${unit}_one`]).toBeTruthy();
        expect(counted[`${unit}_other`]).toBeTruthy();
        expect((locale.nutrition.food.units as Record<string, string>)[unit]).toBeTruthy();
      }
    },
  );
});
