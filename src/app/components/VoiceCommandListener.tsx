import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useLanguage } from '../contexts/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Send, X } from 'lucide-react';
import { Button } from './ui/button';

// ==========================================
// VOICE COMMAND SYSTEM (ระบบสั่งการด้วยเสียง)
// 🚨 BACKEND DEV NOTE:
// คอมโพเนนต์นี้ทำหน้าที่แปลงเสียงเป็นข้อความ (Speech-to-Text) ผ่าน Web Speech API
// จากนั้นจะวิเคราะห์ข้อความ (Text) แบบง่ายๆ ด้วย String Matching (Client-side NLP)
// 💡 ถ้าระบบขยายใหญ่ขึ้น แนะนำให้ส่งข้อความจากที่นี่ไปให้ Backend NLP (เช่น Dialogflow, Rasa หรือ GPT-4)
// เพื่อให้ Backend ส่ง "Intent" กลับมาว่าจะให้หน้าเว็บทำอะไร
// ==========================================

export function VoiceCommandListener() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setLanguage, t, language } = useLanguage();
  
  const [draftCommandState, setDraftCommandState] = useState('');
  const draftCommandRef = useRef('');
  const [isListeningUI, setIsListeningUI] = useState(false);
  const [showFloatingBox, setShowFloatingBox] = useState(false);

  const updateDraft = (newDraft: string) => {
    draftCommandRef.current = newDraft;
    setDraftCommandState(newDraft);
  };

  // Keep references to latest so event listeners don't use stale closures
  const navigateRef = useRef(navigate);
  const locationRef = useRef(location);
  const setLanguageRef = useRef(setLanguage);
  const tRef = useRef(t);
  const languageRef = useRef(language);
  const recognitionRef = useRef<any>(null);
  
  useEffect(() => {
    navigateRef.current = navigate;
    locationRef.current = location;
    setLanguageRef.current = setLanguage;
    tRef.current = t;
    languageRef.current = language;
  }, [navigate, location, setLanguage, t, language]);

  const toggleListening = () => {
    if (isListeningUI && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListeningUI(false);
      return;
    }
    if (!isListeningUI && recognitionRef.current) {
      try {
        recognitionRef.current.lang = language === 'en' ? 'en-US' : 'th-TH';
        recognitionRef.current.start();
        setIsListeningUI(true);
      } catch (e) {
        console.error("Failed to start listening:", e);
      }
    }
  };

  useEffect(() => {
    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Single command like GPT
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const text = (finalTranscript || interimTranscript).trim().toLowerCase().replace(/สแกนน์|สะแกน/g, 'สแกน');
      
      if (text) {
        updateDraft(text);
      }
    };

    recognition.onerror = (event: any) => {
      console.log(`[VoiceCommand] Error: ${event.error}`);
      setIsListeningUI(false);
    };

    recognition.onend = () => {
      console.log("[VoiceCommand] Recognition ended");
      setIsListeningUI(false);
    };

    // Listen for wake-up event
    const handleWakeUp = () => {
      setShowFloatingBox(true);
      if (!isListeningUI) {
         try {
           recognition.lang = language === 'en' ? 'en-US' : 'th-TH';
           recognition.start();
           setIsListeningUI(true);
         } catch(e) {}
      }
    };
    window.addEventListener('wake-up-mic', handleWakeUp);

    return () => {
      window.removeEventListener('wake-up-mic', handleWakeUp);
      if (recognition) {
        recognition.abort();
      }
    };
  }, [language]); // Restart when language changes

  const highlightElement = (el: HTMLElement) => {
    const originalTransition = el.style.transition;
    const originalBoxShadow = el.style.boxShadow;
    
    el.style.transition = 'box-shadow 0.2s ease-in-out';
    el.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.7)'; // blue-500 with opacity
    
    setTimeout(() => {
      el.style.boxShadow = originalBoxShadow;
      setTimeout(() => {
        el.style.transition = originalTransition;
      }, 200);
    }, 800);
  };

  const getMatchScore = (spoken: string, text: string) => {
    const s1 = spoken.toLowerCase().replace(/\s+/g, '');
    const s2 = text.toLowerCase().replace(/\s+/g, '');
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    
    // If exact substring match, give a decent base score, boosted by ratio
    if (s2.includes(s1)) {
      const ratio = s1.length / s2.length;
      return 0.6 + (ratio * 0.4); // Minimum 0.6 if it's a direct substring
    }
    if (s1.includes(s2)) {
      const ratio = s2.length / s1.length;
      return 0.6 + (ratio * 0.4);
    }
    
    // intersection ratio for multi-word english phrases
    const w1 = spoken.toLowerCase().split(/\s+/);
    const w2 = text.toLowerCase().split(/\s+/);
    const intersection = w1.filter(w => w2.includes(w));
    if (intersection.length > 0) {
      return (intersection.length * 2) / (w1.length + w2.length) * 0.8; // Max 0.8 for intersection
    }
    return 0;
  };

  const findBestElement = (targetText: string, selector: string) => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
    let bestMatch: HTMLElement | null = null;
    let highestScore = 0;

    elements.forEach(el => {
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return; // Ignore invisible
      
      let text = '';
      if (el instanceof HTMLInputElement && (el.type === 'button' || el.type === 'submit')) {
        text = el.value;
      } else {
        text = el.innerText || el.textContent || el.getAttribute('aria-label') || '';
      }
      
      text = text.trim();
      if (!text) return;
      
      const score = getMatchScore(targetText, text);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = el;
      }
    });

    return { bestMatch, highestScore };
  };

  const isProcessingRef = useRef(false);
  const commandQueueRef = useRef<string[]>([]);

  const processQueue = async () => {
    if (isProcessingRef.current || commandQueueRef.current.length === 0) return;
    isProcessingRef.current = true;
    
    while (commandQueueRef.current.length > 0) {
      const fullCommand = commandQueueRef.current.shift();
      if (!fullCommand) continue;
      
      const commands = fullCommand.split(/\s+(?:and|then|แล้ว|และ)\s+/i).map(c => c.trim()).filter(Boolean);
      for (const cmd of commands) {
        await processSingleCommand(cmd);
        await new Promise(r => setTimeout(r, 600));
      }
    }
    
    isProcessingRef.current = false;
  };

  const processSingleCommand = async (command: string) => {
    // 💡 BACKEND NLP (Natural Language Processing) 💡
    // ถ้าระบบนี้ถูกเชื่อมกับ Backend AI (เช่น Python + Dialogflow / OpenAI API) 
    // เราจะเขียนโค้ดเรียก POST /api/nlp/parse ที่นี่
    // const response = await fetch('/api/nlp/parse', { method: 'POST', body: JSON.stringify({ text: command }) });
    // const { intent, payload } = await response.json();
    // if(intent === 'START_SCAN') handleStartScan(payload.type);

    if (!command) return;
    const cmd = command.toLowerCase();
    const _t = tRef.current;
    const currentLang = languageRef.current;

    const triggerExplicitAction = (targetTexts: string[]) => {
      for (const text of targetTexts) {
        const { bestMatch, highestScore } = findBestElement(text, 'button, a, [role="button"], [role="tab"], [role="menuitem"], .cursor-pointer, label');
        if (bestMatch && highestScore > 0.6) {
          highlightElement(bestMatch);
          setTimeout(() => bestMatch.click(), 500);
          return true;
        }
      }
      return false;
    };

    let isLangChangeToEn = /เปลี่ยนภาษา.*(อังกฤษ|english)|ภาษาอังกฤษ|english|change language.*(english)|english language/i.test(cmd);
    let isLangChangeToTh = /change language.*(thai)|thai language|thai|เปลี่ยนภาษา.*(ไทย)|ภาษาไทย/i.test(cmd);

    let isNavDashboard = /หน้าหลัก|แดชบอร์ด|โฮม|ไป(หน้าหลัก|dashboard|home)|dashboard|home/i.test(cmd);
    let isNavScanner = /หน้าสแกน|ตัวสแกน|ไป(หน้าสแกน|สแกน|scanner)|scanner/i.test(cmd);
    let isNavHistory = /ประวัติ|ประวัติ(การสแกน|สแกน)|ไป(หน้าประวัติ|ประวัติ|history)|history/i.test(cmd);

    let isBack = /กลับไป|ย้อนกลับ|กลับหน้าก่อน|ย้อนหน้า|go back|back|previous page/i.test(cmd);
    let isStopScan = /หยุด|หยุดสแกน|หยุดทั้งหมด|หยุดก่อน|พักก่อน|stop|pause/i.test(cmd);

    let isFullScan = /สแกน(เต็ม|เต็มรูปแบบ|แบบละเอียด|ละเอียด|ลึก|หนักๆ|จัดเต็ม|ทุกพอร์ต|ทุกอย่าง|ทั้งหมด|ให้ครบ|ให้หมด|จริงจัง|แบบเน้นๆ|ละเอียดสุด)|จัดเต็ม|เอาแบบ(จัดเต็ม|ละเอียด|ลึก|สุด)|ตรวจ(ละเอียด|เต็มระบบ|ลึก|หมด)|เช็ค(ละเอียด|ทุกพอร์ต|ทั้งหมด)|เอาให้(ครบ|หมด)|จัดหนัก|เต็มระบบ|เอาเต็มๆ|(full|deep|complete|intensive|maximum|comprehensive|heavy|full system)\s*scan|scan (all ports|everything|entire network|deeply|all devices)/i.test(cmd);
    
    let isBasicScan = false;
    if (!isFullScan && !isStopScan) {
      isBasicScan = /สแกน(พื้นฐาน|แบบเร็ว|ไวๆ|ด่วน|เบื้องต้น|คร่าวๆ|ธรรมดา|ทั่วไป|ไม่ต้องละเอียด|เบาๆ|พอ)|เริ่มสแกน|ลองสแกน|สั่งสแกน|ช่วยสแกน|ตรวจ(เครือข่าย|ระบบ|แบบเร็ว|คร่าวๆ)|เช็ค(เครือข่าย|ระบบ|แบบเร็ว)|ลองเช็ค|ดูคร่าวๆ|ลองดู|ดูหน่อย|เอาแบบเร็ว|ขอแบบเร็วๆ|ช่วยดูให้หน่อย|เช็คให้หน่อย|ตรวจให้หน่อย|(start|run|quick|fast|light|simple|basic)\s*scan|scan (quickly|fast)|check (network|system)|test network|look quickly|do a quick check|run a quick test/i.test(cmd) || /^(สแกน|ตรวจ|เช็ค|scan|check)$/i.test(cmd.trim()) || /(สแกน|ตรวจ|เช็ค)/i.test(cmd);
    }

    let isExportJson = /json|เจซัน/i.test(cmd) && (/export|ดาวน์โหลด|โหลด|ดึง|ส่งออก|เซฟ/i.test(cmd));
    let isExportCsv = /csv|ซีเอสวี/i.test(cmd) && (/export|ดาวน์โหลด|โหลด|ดึง|ส่งออก|เซฟ/i.test(cmd));
    let isExportPdf = /pdf|พีดีเอฟ/i.test(cmd) && (/export|ดาวน์โหลด|โหลด|ดึง|ส่งออก|เซฟ/i.test(cmd));
    let isExport = /บันทึก|บันทึกผล|บันทึกข้อมูล|เซฟ|เซฟผล|เซฟข้อมูล|เก็บข้อมูล|เก็บผล|เก็บไว้|เก็บไฟล์|ส่งออก|เอาออก|ดึงออก|ดาวน์โหลด|ดาวน์โหลดรายงาน|โหลดรายงาน|เอารายงาน|ขอรายงาน|ดูรายงาน|สร้างรายงาน|เอาผลลัพธ์|ขอผลลัพธ์|แปลงเป็นไฟล์|เซฟเป็นไฟล์|ทำเป็นไฟล์|save|save results|save data|export|export report|download report|download file|get report|save as file|generate report|create report/i.test(cmd);
    
    let isSelectAll = /เลือก(ทั้งห���ด|ทุกอัน|หมด|ให้หมด|ทั้งหมดเลย)|เอา(ทั้งหมด|หมด)|select (all|everything)/i.test(cmd);
    let isClearSelection = /ยกเลิกการเลือก|ล้างที่เลือก|เอาออกจากที่เลือก|ไม่เลือก|เอาออก|clear selection|remove selection|deselect/i.test(cmd) && !isExport;
    
    let isClearSearch = /ล้าง|ล้างข้อมูล|ล้างทั้งหมด|เคลียร์|รีเซ็ต|เริ่มใหม่|รีสตาร์ท|ตั้งค่าใหม่|clear|clear data|reset|restart|start over/i.test(cmd) && !isClearSelection;

    let isScrollDown = /เลื่อน(ลง|ลงหน่อย|นิดนึง|อีก|ต่อ)|scroll (down|more)/i.test(cmd);
    let isScrollUp = /เลื่อน(ขึ้น|ขึ้นหน่อย)|scroll up/i.test(cmd);

    let searchMatch: string | null = null;
    let actionMatch: string | null = null;

    const sMatchTh = cmd.match(/^(?:ค้นหา|หา|พิมพ์|ใส่ค่า|กรอก|กรอกข้อมูล|เสิร์ช|ค้น|เปิด|ดู|เอา ip|หา ip|ค้น ip|ดู ip|เอาพอร์ต|หา port|ดู port)(?:ให้หน่อย|ช่วย|ลอง)?\s*(.*)/i);
    const sMatchEn = cmd.match(/^(?:search|find|lookup|type|enter|look for|check|input)(?:\s+for)?\s*(.*)/i);
    
    if (sMatchTh && sMatchTh[1]) {
      searchMatch = sMatchTh[1].trim();
    } else if (sMatchEn && sMatchEn[1]) {
      searchMatch = sMatchEn[1].trim();
    } else {
      const iMatchTh = cmd.match(/(?:ค้นหา|หา|พิมพ์|เสิร์ช)\s+([a-zA-Z0-9.\-_]+)/i);
      const iMatchEn = cmd.match(/(?:search|find|type|enter)\s+([a-zA-Z0-9.\-_]+)/i);
      if (iMatchTh) searchMatch = iMatchTh[1].trim();
      else if (iMatchEn) searchMatch = iMatchEn[1].trim();
    }

    const aMatchTh = cmd.match(/^(?:คลิก|กด|แตะ|เลือก|ดู|เปิด|เปิดดู|เข้าไปดู)(?:นี้|นั้น|แรก|สุดท้าย|ล่าสุด|เพิ่ม|เพิ่มอีก)?\s*(.*)/i);
    const aMatchEn = cmd.match(/^(?:click|tap|select|open|view|show)(?:\s+this|\s+item|\s+add)?\s*(.*)/i);
    
    if (aMatchTh && aMatchTh[1]) actionMatch = aMatchTh[1].trim();
    else if (aMatchEn && aMatchEn[1]) actionMatch = aMatchEn[1].trim();

    // --- Execution Phase ---

    if (isLangChangeToEn) {
      setLanguageRef.current('en');
      return;
    }
    if (isLangChangeToTh) {
      setLanguageRef.current('th');
      return;
    }

    if (isNavDashboard && !isNavScanner && !isNavHistory) {
      console.log('Intent matched: Go to Dashboard');
      navigateRef.current('/');
      return;
    }
    if (isNavScanner && !isNavDashboard && !isNavHistory) {
      console.log('Intent matched: Go to Scanner');
      navigateRef.current('/scanner');
      return;
    }
    if (isNavHistory && !isNavDashboard && !isNavScanner) {
      console.log('Intent matched: Go to History');
      navigateRef.current('/history');
      return;
    }

    if (isBack) {
      console.log('Intent matched: Go Back');
      navigateRef.current(-1);
      return;
    }

    if (isStopScan) {
      console.log('Intent matched: Stop Scan');
      triggerExplicitAction([_t('stopScan'), 'Stop Scan', 'หยุดสแกน']);
      return;
    }

    if (isFullScan) {
      console.log('Intent matched: Full Scan');
      triggerExplicitAction([_t('fullScan'), 'Full Scan', 'สแกนเต็มรูปแบบ', 'สแกนเต็ม']);
      return;
    }

    if (isBasicScan) {
      console.log('Intent matched: Basic Scan');
      triggerExplicitAction([_t('basicScan'), 'Basic Scan', 'สแกนพื้นฐาน']);
      return;
    }

    if (isExportJson || isExportCsv || isExportPdf) {
      console.log('Intent matched: Export specific format');
      // Fire global event so Scanner.tsx can handle it directly if the dropdown is hidden
      let format = isExportJson ? 'json' : isExportCsv ? 'csv' : 'pdf';
      window.dispatchEvent(new CustomEvent('voice-intent-export', { detail: format }));
      // Fallback UI click
      if (isExportJson) triggerExplicitAction([_t('export_json'), 'Export JSON', 'ส่งออก JSON']);
      if (isExportCsv) triggerExplicitAction([_t('export_csv'), 'Export CSV', 'ส่งออก CSV']);
      if (isExportPdf) triggerExplicitAction([_t('export_pdf'), 'Export PDF', 'ส่งออก PDF']);
      return;
    }

    if (isExport) {
      console.log('Intent matched: Export / Save');
      triggerExplicitAction([_t('exportReport'), 'Export Report', 'ส่งออกรายงาน', _t('saveResults'), 'Save Results', 'บันทึกผลการสแกน']);
      return;
    }

    if (isSelectAll) {
      console.log('Intent matched: Select All');
      triggerExplicitAction([_t('select_all'), 'Select All', 'เลือกทั้งหมด']);
      return;
    }

    if (isClearSelection) {
      console.log('Intent matched: Clear Selection');
      triggerExplicitAction([_t('select_all'), 'Select All', 'เลือกทั้งหมด']); // Toggle off assuming toggle logic
      return;
    }

    if (isClearSearch) {
      console.log('Intent matched: Clear Search / Reset');
      const clicked = triggerExplicitAction([_t('clear_filters'), 'Clear Filters', 'ล้างตัวกรอง', 'Clear', 'ล้าง']);
      if (!clicked) {
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="text"], input:not([type])'));
        inputs.forEach(input => {
          if (input.offsetWidth > 0 || input.offsetHeight > 0) {
            highlightElement(input);
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            nativeInputValueSetter?.call(input, "");
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      }
      return;
    }

    if (isScrollDown) {
      console.log('Intent matched: Scroll Down');
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
      return;
    }
    
    if (isScrollUp) {
      console.log('Intent matched: Scroll Up');
      window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' });
      return;
    }

    if (searchMatch) {
      console.log('Intent matched: Search / Fill Input =>', searchMatch);
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'));
      const visibleInputs = inputs.filter(el => el.offsetWidth > 0 || el.offsetHeight > 0);
      
      if (visibleInputs.length > 0) {
        let targetInput = visibleInputs[0];
        const searchInput = visibleInputs.find(el => {
          const ph = (el.placeholder || '').toLowerCase();
          return ph.includes('search') || ph.includes('ค้นหา') || ph.includes('ip') || ph.includes('target');
        });
        if (searchInput) targetInput = searchInput;

        highlightElement(targetInput);
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        nativeInputValueSetter?.call(targetInput, searchMatch);
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }

    // Generic Actions / Clicks
    if (actionMatch && actionMatch.length > 0) {
      console.log('Intent matched: Explicit Action Click =>', actionMatch);
      
      // Specifically handle "details" for table rows
      if (actionMatch.includes('details') || actionMatch.includes('รายละเอียด')) {
         triggerExplicitAction([_t('details'), 'Details', 'รายละเอียด']);
         return;
      }

      const selector = 'button, a, [role="button"], [role="tab"], [role="menuitem"], .cursor-pointer';
      const { bestMatch, highestScore } = findBestElement(actionMatch, selector);
      
      if (bestMatch && highestScore > 0.3) {
        highlightElement(bestMatch);
        setTimeout(() => bestMatch.click(), 500);
        return;
      }
    } else if (cmd) {
       // Fallback bare keyword search (requires higher confidence)
       const selector = 'button, a, [role="button"], [role="tab"], [role="menuitem"], .cursor-pointer';
       const { bestMatch, highestScore } = findBestElement(cmd, selector);
       if (bestMatch && highestScore > 0.7) {
           console.log('Intent matched: Fallback Click =>', cmd);
           highlightElement(bestMatch);
           setTimeout(() => bestMatch.click(), 500);
       }
    }
  };

  const handleCommand = (command: string) => {
    if (!command) return;
    commandQueueRef.current.push(command);
    processQueue();
  };

  return (
    <AnimatePresence>
      {showFloatingBox && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 px-4"
        >
          <div className="bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl p-2 pl-4 flex items-center gap-3 transition-all relative">
            <button 
              onClick={toggleListening}
              className={`flex-shrink-0 p-2.5 rounded-full transition-all ${
                isListeningUI 
                  ? 'bg-destructive/20 text-destructive shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
                  : 'bg-primary/20 text-primary hover:bg-primary/30'
              }`}
            >
              <Mic className={`h-5 w-5 ${isListeningUI ? 'animate-pulse' : ''}`} />
            </button>
            
            <input 
              type="text"
              value={draftCommandState}
              onChange={(e) => updateDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draftCommandState.trim()) {
                  handleCommand(draftCommandState);
                  updateDraft('');
                  setIsListeningUI(false);
                }
              }}
              className="flex-1 bg-transparent border-none text-foreground placeholder-muted-foreground focus:outline-none focus:ring-0 text-lg py-2"
              placeholder={language === 'th' ? "พูดคำสั่ง หรือพิมพ์ที่นี่..." : "Say a command or type..."}
              autoFocus
            />

            <div className="flex items-center gap-1.5 pr-1">
              {draftCommandState.trim() && (
                <>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-muted-foreground hover:text-destructive gap-1 px-3"
                    onClick={() => {
                      updateDraft('');
                      setIsListeningUI(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                    <span className="hidden sm:inline">{language === 'th' ? 'ล้าง' : 'Clear'}</span>
                  </Button>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="gap-2 px-4 rounded-full"
                    onClick={() => {
                      if (draftCommandState.trim()) {
                        handleCommand(draftCommandState);
                        updateDraft('');
                        setIsListeningUI(false);
                      }
                    }}
                  >
                    <span className="hidden sm:inline">{language === 'th' ? 'ยืนยัน' : 'Confirm'}</span>
                    <Send className="h-4 w-4" />
                  </Button>
                </>
              )}
              {!draftCommandState.trim() && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-muted-foreground hover:text-destructive rounded-full h-8 w-8 p-0 ml-1"
                  onClick={() => {
                    setShowFloatingBox(false);
                    if (isListeningUI && recognitionRef.current) {
                      recognitionRef.current.stop();
                      setIsListeningUI(false);
                    }
                  }}
                  title={language === 'th' ? 'ปิด' : 'Close'}
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
