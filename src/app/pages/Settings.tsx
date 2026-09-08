import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useLanguage } from '../contexts/LanguageContext';
import { Languages, Check } from 'lucide-react';

export function Settings() {
  const { t, language, setLanguage } = useLanguage();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ==========================================
          HEADER (ส่วนหัวของหน้าตั้งค่า)
          ========================================== */}
      <h1 className="text-3xl font-bold">{t('settings')}</h1>

      {/* ==========================================
          LANGUAGE SETTINGS (ส่วนตั้งค่าภาษา)
          ========================================== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            {t('language')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              variant={language === 'th' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setLanguage('th')}
              className="justify-between"
            >
              <span>{t('thai')}</span>
              {language === 'th' && <Check className="h-5 w-5" />}
            </Button>
            <Button
              variant={language === 'en' ? 'default' : 'outline'}
              size="lg"
              onClick={() => setLanguage('en')}
              className="justify-between"
            >
              <span>{t('english')}</span>
              {language === 'en' && <Check className="h-5 w-5" />}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('language_description')}
          </p>
        </CardContent>
      </Card>

      {/* ==========================================
          ABOUT SECTION (ส่วนแสดงข้อมูลเกี่ยวกับแอพ)
          ========================================== */}
      <Card>
        <CardHeader>
          <CardTitle>{t('about_network_scanner')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {t('about_description')}
          </p>
          <p>{t('version')}: 1.0.0</p>
        </CardContent>
      </Card>
    </div>
  );
}
