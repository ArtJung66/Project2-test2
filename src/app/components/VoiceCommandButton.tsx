import { useState, useEffect } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from './ui/button';
import { useLanguage } from '../contexts/LanguageContext';
import { toast } from 'sonner';

interface VoiceCommandButtonProps {
  onCommand: (command: string) => void;
}

export function VoiceCommandButton({ onCommand }: VoiceCommandButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const { t, language } = useLanguage();

  useEffect(() => {
    // Check if browser supports speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = language === 'th' ? 'th-TH' : 'en-US';

      recognitionInstance.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        console.log('Voice command:', transcript);
        onCommand(transcript);
        setIsListening(false);
      };

      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        
        // Only show error toast for non-permission errors
        if (event.error !== 'not-allowed' && event.error !== 'no-speech') {
          toast.error(t('voiceNotSupported'));
        } else if (event.error === 'not-allowed') {
          // Silently handle permission denied - user likely doesn't want to use voice
          console.log('Microphone permission denied');
        }
        
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    }
  }, [language, onCommand, t]);

  const toggleListening = () => {
    if (!recognition) {
      toast.error(t('voiceNotSupported'));
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.lang = language === 'th' ? 'th-TH' : 'en-US';
      recognition.start();
      setIsListening(true);
      toast.info(t('listeningVoice'));
    }
  };

  return (
    <Button
      onClick={toggleListening}
      variant={isListening ? 'destructive' : 'outline'}
      size="lg"
      className="gap-2"
    >
      {isListening ? (
        <>
          <MicOff className="h-5 w-5 animate-pulse" />
          {t('listeningVoice')}
        </>
      ) : (
        <>
          <Mic className="h-5 w-5" />
          {t('voiceCommand')}
        </>
      )}
    </Button>
  );
}