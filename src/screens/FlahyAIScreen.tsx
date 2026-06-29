import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FileText, Send, Shield, Sparkles } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { Header } from '../components/Header';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { API_BASE_URL, patientApiRoutes, WEB_APP_URL } from '../config';
import { RootStackParamList } from '../navigation/types';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { FLAHY_AI_SYSTEM_PROMPT } from '../constants/flahyAIPrompt';
import { MEDICAL_DISCLAIMER } from '../constants/medicalDisclaimer';
import { colors } from '../theme/colors';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
};

const SUGGESTIONS = [
  { id: '1', text: 'Explain my report', icon: FileText },
  // { id: '2', text: "What's in my recent uploads?", icon: Zap },
];

// ---------------------------------------------------------------------------
// Lightweight markdown renderer (zero dependencies, RN 0.83 / React 19 safe)
// Handles: bold, italic, inline code, code blocks, headers, lists, links
// ---------------------------------------------------------------------------

type MdNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; url: string };

function parseInline(line: string): MdNode[] {
  const nodes: MdNode[] = [];
  // Order matters: bold before italic, code before bold
  const regex =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', text: line.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // inline code `...`
      nodes.push({ type: 'code', text: match[1].slice(1, -1) });
    } else if (match[2]) {
      // bold **...**
      nodes.push({ type: 'bold', text: match[2].slice(2, -2) });
    } else if (match[3]) {
      // italic *...*
      nodes.push({ type: 'italic', text: match[3].slice(1, -1) });
    } else if (match[4]) {
      // italic _..._
      nodes.push({ type: 'italic', text: match[4].slice(1, -1) });
    } else if (match[5]) {
      // link [text](url)
      nodes.push({ type: 'link', text: match[6], url: match[7] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    nodes.push({ type: 'text', text: line.slice(lastIndex) });
  }

  return nodes;
}

function InlineText({ text }: { text: string }) {
  const nodes = parseInline(text);

  return (
    <Text style={md.body}>
      {nodes.map((node, i) => {
        switch (node.type) {
          case 'bold':
            return (
              <Text key={i} style={md.bold}>
                {node.text}
              </Text>
            );
          case 'italic':
            return (
              <Text key={i} style={md.italic}>
                {node.text}
              </Text>
            );
          case 'code':
            return (
              <Text key={i} style={md.inlineCode}>
                {node.text}
              </Text>
            );
          case 'link':
            return (
              <Text
                key={i}
                style={md.link}
                onPress={() => Linking.openURL(node.url)}
              >
                {node.text}
              </Text>
            );
          default:
            return <Text key={i}>{node.text}</Text>;
        }
      })}
    </Text>
  );
}

function MarkdownText({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactElement[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block (``` ... ```)
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <View key={elements.length} style={md.codeBlock}>
          <Text style={md.codeBlockText}>{codeLines.join('\n')}</Text>
        </View>,
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const headerStyle = level === 1 ? md.h1 : level === 2 ? md.h2 : md.h3;
      elements.push(
        <Text key={elements.length} style={headerStyle}>
          {headerMatch[2]}
        </Text>,
      );
      i++;
      continue;
    }

    // Unordered list item (-, *, +)
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      const indent = Math.floor((ulMatch[1]?.length || 0) / 2);
      elements.push(
        <View
          key={elements.length}
          style={[md.listItem, { paddingLeft: 8 + indent * 16 }]}
        >
          <Text style={md.bullet}>{'\u2022'}</Text>
          <View style={md.listContent}>
            <InlineText text={ulMatch[2]} />
          </View>
        </View>,
      );
      i++;
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      const indent = Math.floor((olMatch[1]?.length || 0) / 2);
      elements.push(
        <View
          key={elements.length}
          style={[md.listItem, { paddingLeft: 8 + indent * 16 }]}
        >
          <Text style={md.bullet}>{olMatch[2]}.</Text>
          <View style={md.listContent}>
            <InlineText text={olMatch[3]} />
          </View>
        </View>,
      );
      i++;
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s*(.*)$/);
    if (bqMatch) {
      elements.push(
        <View key={elements.length} style={md.blockquote}>
          <InlineText text={bqMatch[1]} />
        </View>,
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      elements.push(<View key={elements.length} style={md.hr} />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <View key={elements.length} style={md.paragraph}>
        <InlineText text={line} />
      </View>,
    );
    i++;
  }

  return <View>{elements}</View>;
}

// ---------------------------------------------------------------------------
// AI SDK data stream parser
// ---------------------------------------------------------------------------

/**
 * Parse a single SSE line. The server sends:
 *   data: {"type":"text-delta","delta":"Hi"}
 * Returns the delta text or null.
 */
function parseSSELine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data: ')) return null;

  try {
    const json = JSON.parse(trimmed.slice(6));
    if (json.type === 'text-delta' && typeof json.delta === 'string') {
      return json.delta;
    }
  } catch {
    // skip malformed lines
  }
  return null;
}

/**
 * Parse a full SSE response text into concatenated content.
 */
function parseSSEResponse(text: string): string {
  return text.split('\n').map(parseSSELine).filter(Boolean).join('');
}

// ---------------------------------------------------------------------------
// Screen component
// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<RootStackParamList, 'FlahyAI'>;

type ReportFile = {
  base64: string;
  mediaType: string;
  filename: string;
};

const MAX_REPORT_TEXT_CHARS = 12000;

function getMimeTypeFromName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'html' || ext === 'htm') return 'text/html';
  if (ext === 'json') return 'application/json';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

function normalizeContentType(value: string): string {
  return (value || '').toLowerCase().split(';')[0].trim();
}

function pickHeader(
  headers: Record<string, any> | undefined,
  key: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = key.toLowerCase();
  for (const h of Object.keys(headers)) {
    if (h.toLowerCase() === lower) return String(headers[h]);
  }
  return undefined;
}

// Base64 -> UTF-8 string. Uses global.atob (available in RN 0.71+).
function decodeBase64Utf8(b64: string): string {
  try {
    const atobFn = (globalThis as any).atob as
      | ((s: string) => string)
      | undefined;
    // atob decodes base64 to a binary string; each char code is a byte.
    const binary = typeof atobFn === 'function' ? atobFn(b64) : '';
    if (!binary) return '';
    // Decode UTF-8 manually — TextDecoder is not reliably available in RN.
    let out = '';
    let i = 0;
    while (i < binary.length) {
      const c = binary.charCodeAt(i++);
      if (c < 0x80) {
        out += String.fromCharCode(c);
      } else if (c < 0xe0 && i < binary.length) {
        const c2 = binary.charCodeAt(i++);
        out += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
      } else if (i + 1 < binary.length) {
        const c2 = binary.charCodeAt(i++);
        const c3 = binary.charCodeAt(i++);
        out += String.fromCharCode(
          ((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f),
        );
      }
    }
    return out;
  } catch {
    return '';
  }
}

function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_REPORT_TEXT_CHARS);
}

function jsonToReportText(jsonText: string): string {
  try {
    const parsed = JSON.parse(jsonText);
    return JSON.stringify(parsed, null, 2).slice(0, MAX_REPORT_TEXT_CHARS);
  } catch {
    return String(jsonText || '').slice(0, MAX_REPORT_TEXT_CHARS);
  }
}

function looksLikeHtml(sample: string): boolean {
  const normalized = sample.trimStart().toLowerCase();
  return (
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<html') ||
    normalized.includes('<html') ||
    normalized.includes('<body') ||
    normalized.includes('<head')
  );
}

function looksLikeJson(sample: string): boolean {
  const trimmed = sample.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

const AI_CONSENT_KEY = 'flahy_ai_consent_accepted';

export const FlahyAIScreen = ({ navigation }: Props) => {
  // ---- AI Data Consent ----
  const [hasAIConsent, setHasAIConsent] = useState<boolean | null>(null); // null = loading

  useEffect(() => {
    AsyncStorage.getItem(AI_CONSENT_KEY).then(val => {
      setHasAIConsent(val === 'true');
    });
  }, []);

  const handleAcceptAIConsent = async () => {
    await AsyncStorage.setItem(AI_CONSENT_KEY, 'true');
    setHasAIConsent(true);
  };

  const handleDeclineAIConsent = () => {
    navigation.goBack();
  };

  // ---- Store-backed state ----
  const storeMessages = useChatStore(s => {
    const thread = s.threads.find(t => t.id === s.currentThreadId);
    return thread?.messages ?? [];
  });
  const currentThreadId = useChatStore(s => s.currentThreadId);
  const {
    createThread,
    addMessage: storeAddMessage,
    updateMessage: storeUpdateMessage,
    setMessages: storeSetMessages,
  } = useChatStore.getState();

  // ---- Local transient state (not persisted) ----
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [streamingContent, setStreamingContent] = useState('');
  const [greetingMessage, setGreetingMessage] = useState<Message | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);

  // Merge: local greeting + store messages (with streaming overlay)
  const messages: Message[] = [
    ...(greetingMessage ? [greetingMessage] : []),
    ...storeMessages.map(m => {
      if (m.id === streamingMessageId) {
        return {
          id: m.id,
          role: m.role,
          content: streamingContent,
          isStreaming: true,
        };
      }
      return { id: m.id, role: m.role, content: m.content };
    }),
  ];

  // Report file data — attached to the first user message (same as web)
  const reportFileRef = useRef<ReportFile | null>(null);
  // Report text (used for HTML/JSON reports) — injected as REPORT_TEXT in system prompt.
  const reportTextRef = useRef<string | null>(null);

  const scrollToBottom = (animated = true) => {
    const offset = contentHeightRef.current - layoutHeightRef.current;
    if (offset > 0) {
      flatListRef.current?.scrollToOffset({ offset, animated });
    }
  };

  // Scroll to bottom after init
  useEffect(() => {
    if (!isInitializing && messages.length > 0) {
      setTimeout(() => scrollToBottom(false), 400);
    }
  }, [isInitializing]);

  // Scroll on new messages
  useEffect(() => {
    if (messages.length > 1) {
      setTimeout(() => scrollToBottom(true), 150);
    }
  }, [messages.length]);

  // Android: track keyboard height manually
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', e => {
      setKeyboardHeight(e.endCoordinates.height + 25);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Initialize thread + load report on mount
  useEffect(() => {
    if (!currentThreadId) createThread();
    loadLatestReport();
  }, []);

  const convertHtmlToPdfBase64 = async (
    html: string,
  ): Promise<string | null> => {
    try {
      const response = await fetch(`${WEB_APP_URL}/api/html-to-pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ html }),
      });
      if (!response.ok) return null;
      // Read as base64 via blob util style path. Fallback to text hex decoding isn't safe for binary,
      // so use blob() + FileReader-equivalent via arrayBuffer -> base64.
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
          null,
          Array.from(bytes.subarray(i, i + chunkSize)) as any,
        );
      }
      const btoaFn = (globalThis as any).btoa as
        | ((s: string) => string)
        | undefined;
      return typeof btoaFn === 'function' ? btoaFn(binary) : null;
    } catch (err) {
      console.error('html-to-pdf conversion failed:', err);
      return null;
    }
  };

  const loadLatestReport = async () => {
    setIsInitializing(true);
    try {
      const token = useAuthStore.getState().token;
      if (!token) {
        setGreetingMessage({
          id: 'greeting',
          role: 'assistant',
          content: 'Hello! I am FlahyAI. How can I help you today?',
        });
        return;
      }

      // 1. Fetch report list
      const listResponse = await api.get(
        `${patientApiRoutes.reportList}?page=1&limit=10`,
      );
      const reports = listResponse.data?.data;

      if (!reports || reports.length === 0) {
        setGreetingMessage({
          id: 'greeting',
          role: 'assistant',
          content:
            'Hello! I am FlahyAI. You have no uploaded reports yet. You can still ask me health-related questions!',
        });
        return;
      }

      const latestReport = reports[0];
      const fileName: string =
        latestReport.file_name || `report-${latestReport.id}`;

      // 2. Download the actual report file as base64
      const downloadUrl = `${API_BASE_URL}${patientApiRoutes.downloadReport}/${latestReport.id}`;
      const downloadResponse = await ReactNativeBlobUtil.fetch(
        'GET',
        downloadUrl,
        {
          Authorization: `Bearer ${token}`,
        },
      );

      const respHeaders = (downloadResponse as any).respInfo?.headers;
      const headerCT = normalizeContentType(
        pickHeader(respHeaders, 'content-type') ||
          pickHeader(respHeaders, 'Content-Type') ||
          '',
      );
      const nameCT = normalizeContentType(getMimeTypeFromName(fileName));
      let effectiveCT = headerCT || nameCT;

      // Reset any previous report context
      reportFileRef.current = null;
      reportTextRef.current = null;

      // Read as text if the content-type or filename hints at text; sniff a 2KB
      // sample before committing so a misreported content-type can't strand the AI
      // with a useless binary payload.
      const maybeText =
        effectiveCT === 'text/html' ||
        effectiveCT === 'application/json' ||
        effectiveCT.startsWith('text/') ||
        !effectiveCT ||
        effectiveCT === 'application/octet-stream';

      let textContent: string | null = null;
      if (maybeText) {
        try {
          const raw: string = (downloadResponse as any).text?.() ?? '';
          if (raw) textContent = raw;
        } catch (err) {
          console.warn(
            'downloadResponse.text() failed, falling back to base64 decode:',
            err,
          );
        }
        if (!textContent) {
          const b64 = downloadResponse.base64();
          const decoded = decodeBase64Utf8(b64);
          if (decoded) textContent = decoded;
        }
      }

      // If sniff identifies HTML/JSON, override a lying/missing content-type.
      if (textContent) {
        const sample = textContent.slice(0, 2048);
        if (effectiveCT !== 'text/html' && looksLikeHtml(sample))
          effectiveCT = 'text/html';
        else if (effectiveCT !== 'application/json' && looksLikeJson(sample))
          effectiveCT = 'application/json';
      }

      if (effectiveCT === 'text/html' && textContent) {
        // Always expose the report as REPORT_TEXT so the AI has it even if PDF
        // conversion fails or the chat route can't read a PDF attachment.
        const plain = htmlToPlainText(textContent);
        if (plain) reportTextRef.current = plain;

        // Best-effort: also convert to PDF so vision models can see layout.
        // If this fails (e.g. html-to-pdf endpoint is unavailable) we still have REPORT_TEXT.
        const pdfBase64 = await convertHtmlToPdfBase64(textContent);
        if (pdfBase64) {
          reportFileRef.current = {
            base64: pdfBase64,
            mediaType: 'application/pdf',
            filename: fileName.replace(/\.(html?|json)$/i, '') + '.pdf',
          };
        }
      } else if (effectiveCT === 'application/json' && textContent) {
        const formatted = jsonToReportText(textContent);
        if (formatted) reportTextRef.current = formatted;
      } else if (
        effectiveCT === 'application/pdf' ||
        effectiveCT.startsWith('image/')
      ) {
        reportFileRef.current = {
          base64: downloadResponse.base64(),
          mediaType: effectiveCT,
          filename: fileName,
        };
      } else if (textContent) {
        // Plain text or unrecognized text blob — still usable as REPORT_TEXT.
        const trimmed = textContent.trim().slice(0, MAX_REPORT_TEXT_CHARS);
        if (trimmed) reportTextRef.current = trimmed;
      } else {
        // Unknown binary — fall back to filename-based MIME as a best guess.
        reportFileRef.current = {
          base64: downloadResponse.base64(),
          mediaType: nameCT,
          filename: fileName,
        };
      }

      console.log('[FlahyAI] report loaded:', {
        fileName,
        headerCT,
        effectiveCT,
        hasText: !!reportTextRef.current,
        textLen: reportTextRef.current?.length ?? 0,
        hasFile: !!reportFileRef.current,
        fileMedia: reportFileRef.current?.mediaType,
      });

      // 3. Show generic greeting (report loaded silently in background)
      setGreetingMessage({
        id: 'greeting',
        role: 'assistant',
        content: 'Hello! I am FlahyAI. How can I help you today?',
      });
    } catch (error: any) {
      console.error('Failed to load report:', error?.message);
      setGreetingMessage({
        id: 'greeting',
        role: 'assistant',
        content: 'Hello! I am FlahyAI. How can I help you today?',
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const sendMessage = async (text: string = inputText) => {
    const msgText = text.trim();
    if (!msgText || isLoading) return;

    const userMsgId = Date.now().toString();
    const userMsg = {
      id: userMsgId,
      role: 'user' as const,
      content: msgText,
    };

    storeAddMessage(userMsg);
    setInputText('');
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();

    try {
      const token = useAuthStore.getState().token;

      // Add placeholder assistant message to store (empty — streaming fills it)
      storeAddMessage({ id: aiMsgId, role: 'assistant', content: '' });
      setStreamingMessageId(aiMsgId);
      setStreamingContent('');

      // Build messages in AI SDK v5 UIMessage format.
      // Read latest store state to include the user message we just added.
      const currentThread = useChatStore
        .getState()
        .threads.find(t => t.id === useChatStore.getState().currentThreadId);
      const allMessages = currentThread?.messages ?? [];

      const filteredMessages = allMessages.filter(
        m =>
          m.id !== aiMsgId && // skip the empty AI placeholder
          m.content && // skip empty
          !m.content.startsWith('Error:') && // skip error messages
          m.content !== 'No response received.' && // skip failed responses
          m.content !== 'Thinking...', // skip placeholders
      );

      // Find the first user message index to attach the report file
      const firstUserIdx = filteredMessages.findIndex(m => m.role === 'user');
      const report = reportFileRef.current;

      const apiMessages = filteredMessages.map((m, idx) => {
        const parts: any[] = [{ type: 'text', text: m.content }];

        // Attach report file to the first user message (same as web)
        if (idx === firstUserIdx && m.role === 'user' && report) {
          parts.push({
            type: 'file',
            mediaType: report.mediaType,
            url: `data:${report.mediaType};base64,${report.base64}`,
          });
        }

        return { id: m.id, role: m.role, parts };
      });

      const reportText = reportTextRef.current;
      const effectiveSystem = reportText
        ? `${FLAHY_AI_SYSTEM_PROMPT}\n\nREPORT_TEXT:\n${reportText}`
        : FLAHY_AI_SYSTEM_PROMPT;

      const response = await fetch(`${WEB_APP_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: apiMessages,
          system: effectiveSystem,
          tools: {},
        }),
        // @ts-ignore — React Native specific option for text streaming
        reactNative: { textStreaming: true },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Server Error (${response.status}): ${errorBody.substring(0, 200)}`,
        );
      }

      // Streaming path — RN 0.71+ with textStreaming enabled
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const delta = parseSSELine(line);
            if (delta) {
              fullContent += delta;
              setStreamingContent(fullContent);
            }
          }
        }

        // Process remaining buffer
        if (buffer) {
          const delta = parseSSELine(buffer);
          if (delta) {
            fullContent += delta;
          }
        }

        // Finalize: persist completed content to store, clear streaming state
        storeUpdateMessage(aiMsgId, {
          content: fullContent || 'No response received.',
        });
        setStreamingMessageId(null);
        setStreamingContent('');
      } else {
        // Fallback: read full response then parse
        const responseText = await response.text();
        const aiContent = parseSSEResponse(responseText);

        storeUpdateMessage(aiMsgId, {
          content: aiContent || 'No response received.',
        });
        setStreamingMessageId(null);
        setStreamingContent('');
      }
    } catch (error: any) {
      console.error('FlahyAI Chat Error:', error);
      storeUpdateMessage(aiMsgId, {
        content: `Error: ${error?.message || 'Something went wrong.'}`,
      });
      setStreamingMessageId(null);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLatestReport = async () => {
    setIsLoading(true);

    try {
      const response = await api.get(
        `${patientApiRoutes.reportList}?page=1&limit=1`,
      );
      const reports = response.data.data;

      if (!reports || reports.length === 0) {
        setGreetingMessage({
          id: 'greeting',
          role: 'assistant',
          content: "I couldn't find any uploaded reports in your account.",
        });
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      sendMessage('Analyze my latest report');
    } catch (error: any) {
      console.error('Fetch Report Error:', error);
      setGreetingMessage({
        id: 'greeting',
        role: 'assistant',
        content: `Failed to fetch report: ${error.message || 'Unknown error'}`,
      });
      setIsLoading(false);
    }
  };

  const handleSuggestionPress = (text: string) => {
    if (text.includes('latest report')) {
      fetchLatestReport();
    } else {
      sendMessage(text);
    }
  };

  // Show loading while checking consent
  if (hasAIConsent === null) {
    return (
      <ScreenWrapper
        className="flex-1 bg-background"
        edges={Platform.OS === 'android' ? ['top'] : ['top', 'bottom']}
      >
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      className="flex-1 bg-background"
      edges={Platform.OS === 'android' ? ['top'] : ['top', 'bottom']}
    >
      {/* AI Data Consent Modal */}
      <Modal visible={!hasAIConsent} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              padding: 24,
              paddingTop: Platform.OS === 'ios' ? 60 : 40,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors['green-light'],
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Shield size={30} color={colors.primary} />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '700',
                  color: colors['text-primary'],
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                FlahyAI Data Consent
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  textAlign: 'center',
                  lineHeight: 22,
                }}
              >
                FlahyAI uses third-party AI service providers to process your
                health data and queries in order to generate insights and
                recommendations. Your report data and messages will be sent to
                these providers when you use FlahyAI.
              </Text>
            </View>

            {/* What data is shared */}
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 16,
                padding: 20,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: '#F3F4F6',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors['text-primary'],
                  marginBottom: 12,
                }}
              >
                What data is shared
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                  marginBottom: 6,
                }}
              >
                {'\u2022'} Your health or medical data (such as diagnostic
                reports, biomarkers, and related insights)
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                  marginBottom: 6,
                }}
              >
                {'\u2022'} Your queries, inputs, and interactions with FlahyAI
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                }}
              >
                {'\u2022'} Contextual information necessary to generate relevant
                responses
              </Text>
            </View>

            {/* Who receives it */}
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 16,
                padding: 20,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: '#F3F4F6',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors['text-primary'],
                  marginBottom: 12,
                }}
              >
                Who receives your data
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                }}
              >
                Your data is sent to trusted third-party AI service providers
                that provide the large language model (LLM) technology powering
                FlahyAI. Your data is used solely to generate responses and
                health-related insights within FlahyAI.
              </Text>
            </View>

            {/* Purpose */}
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 16,
                padding: 20,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: '#F3F4F6',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors['text-primary'],
                  marginBottom: 12,
                }}
              >
                Purpose of sharing
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                  marginBottom: 6,
                }}
              >
                {'\u2022'} Generating responses to your queries
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                  marginBottom: 6,
                }}
              >
                {'\u2022'} Helping you understand your reports
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                }}
              >
                {'\u2022'} Providing health-related insights and recommendations
              </Text>
            </View>

            {/* Safeguards */}
            <View
              style={{
                backgroundColor: 'white',
                borderRadius: 16,
                padding: 20,
                marginBottom: 24,
                borderWidth: 1,
                borderColor: '#F3F4F6',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors['text-primary'],
                  marginBottom: 12,
                }}
              >
                Data protection
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                }}
              >
                Our AI service providers are contractually obligated to maintain
                confidentiality, use data only for providing services to Flahy,
                and implement appropriate security measures consistent with
                applicable laws.
              </Text>
            </View>

            <View
              style={{
                backgroundColor: '#FFFBEB',
                borderRadius: 16,
                padding: 20,
                marginBottom: 24,
                borderWidth: 1,
                borderColor: '#FDE68A',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors['text-primary'],
                  marginBottom: 12,
                }}
              >
                Medical disclaimer
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors['text-secondary'],
                  lineHeight: 22,
                }}
              >
                {MEDICAL_DISCLAIMER}
              </Text>
            </View>

            <Text
              style={{
                fontSize: 13,
                color: colors['text-secondary'],
                textAlign: 'center',
                marginBottom: 20,
                lineHeight: 18,
              }}
            >
              You can choose not to use FlahyAI at any time. For more details,
              read our{' '}
              <Text
                style={{
                  color: colors.primary,
                  textDecorationLine: 'underline',
                }}
                onPress={() =>
                  Linking.openURL(
                    'https://flahyhealth.com/privacy-policy-mobile',
                  )
                }
              >
                Privacy Policy
              </Text>
              .
            </Text>

            {/* Action Buttons */}
            <TouchableOpacity
              onPress={handleAcceptAIConsent}
              style={{
                backgroundColor: colors.primary,
                height: 56,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 4,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 17 }}>
                I Agree & Continue
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDeclineAIConsent}
              style={{
                height: 56,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                marginBottom: 40,
              }}
            >
              <Text
                style={{
                  color: colors['text-secondary'],
                  fontWeight: '500',
                  fontSize: 16,
                }}
              >
                Decline & Go Back
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Header
        showBack={true}
        onBack={() => navigation.goBack()}
        title="FlahyAI"
        subtitle="Your Personal Health AI"
      />

      {isInitializing ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingBottom: 60,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: colors['green-light'],
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Image
              source={require('../assets/flahy_icon.png')}
              style={{ width: 40, height: 40 }}
              resizeMode="contain"
            />
          </View>
          <Text
            style={{
              fontSize: 24,
              fontWeight: '700',
              color: colors['text-primary'],
              marginBottom: 6,
            }}
          >
            FlahyAI
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors['text-secondary'],
              marginBottom: 24,
            }}
          >
            Your Personal Health AI
          </Text>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          style={{ flex: 1 }}
        >
          <View className="flex-1 px-4">
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 120 }}
              onLayout={e => {
                layoutHeightRef.current = e.nativeEvent.layout.height;
              }}
              onContentSizeChange={(_, h) => {
                contentHeightRef.current = h;
                if (isLoading || streamingMessageId) {
                  scrollToBottom(true);
                }
              }}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={
                messages.length < 3 ? (
                  <View className="mt-6">
                    <Text className="mb-3 ml-1 text-sm font-medium text-text-secondary">
                      Suggestions
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      {SUGGESTIONS.map(s => (
                        <TouchableOpacity
                          key={s.id}
                          onPress={() => handleSuggestionPress(s.text)}
                          className="flex-row gap-2 items-center px-4 py-2 bg-white rounded-full border border-gray-100 shadow-sm"
                        >
                          <s.icon size={14} color={colors.primary} />
                          <Text className="text-sm font-medium text-primary">
                            {s.text}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null
              }
              renderItem={({ item }) => (
                <View
                  className={`flex-row mb-4 ${
                    item.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {item.role === 'assistant' && (
                    <View className="justify-center items-center mr-2 ml-1 w-8 h-8 bg-white rounded-full border border-gray-100 shadow-sm">
                      <Image
                        source={require('../assets/flahy_icon.png')}
                        style={{ width: 20, height: 20 }}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                  <View
                    className={`px-5 py-3.5 max-w-[80%] shadow-sm ${
                      item.role === 'user'
                        ? 'bg-primary rounded-2xl rounded-tr-sm'
                        : 'bg-white border border-gray-100 rounded-2xl rounded-tl-sm'
                    }`}
                  >
                    {item.role === 'assistant' ? (
                      <>
                        {item.content ? (
                          <MarkdownText content={item.content} />
                        ) : (
                          <Text style={[md.body, { opacity: 0.5 }]}>
                            Thinking...
                          </Text>
                        )}
                        {item.isStreaming && !item.content && (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                            style={{ marginTop: 4 }}
                          />
                        )}
                      </>
                    ) : item.content ? (
                      <Text className="text-base leading-6 text-white">
                        {item.content}
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
            />
          </View>

          {/* Floating Input Area — uses style (not className) to avoid
                    NativeWind re-processing on every keystroke */}
          <View
            style={[
              inputStyles.wrapper,
              keyboardHeight > 0 && { paddingBottom: keyboardHeight },
            ]}
          >
            <MedicalDisclaimer variant="short" className="mx-4 mb-2" />
            <View style={inputStyles.bar}>
              <View style={inputStyles.iconCircle}>
                <Sparkles size={20} color={colors.primary} />
              </View>
              <View style={inputStyles.inputWrap}>
                <TextInput
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Message FlahyAI..."
                  placeholderTextColor={colors['text-secondary']}
                  style={inputStyles.textInput}
                  textAlignVertical="center"
                  multiline
                />
              </View>
              <TouchableOpacity
                onPress={() => sendMessage()}
                disabled={isLoading || !inputText.trim()}
                style={[
                  inputStyles.sendBtn,
                  isLoading || !inputText.trim()
                    ? inputStyles.sendBtnDisabled
                    : inputStyles.sendBtnActive,
                ]}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Send
                    size={18}
                    color={
                      !inputText.trim() ? colors['text-secondary'] : 'white'
                    }
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </ScreenWrapper>
  );
};

// ---------------------------------------------------------------------------
// Markdown styles
// ---------------------------------------------------------------------------
const md = StyleSheet.create({
  body: {
    color: colors['text-primary'],
    fontSize: 15,
    lineHeight: 22,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  inlineCode: {
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: colors['text-primary'],
  },
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  h1: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
    color: colors['text-primary'],
  },
  h2: {
    fontSize: 19,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 4,
    color: colors['text-primary'],
  },
  h3: {
    fontSize: 17,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 2,
    color: colors['text-primary'],
  },
  paragraph: {
    marginBottom: 6,
  },
  codeBlock: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  codeBlockText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: colors['text-primary'],
    lineHeight: 18,
  },
  listItem: {
    flexDirection: 'row',
    marginVertical: 2,
    alignItems: 'flex-start',
  },
  bullet: {
    color: colors['text-secondary'],
    fontSize: 15,
    lineHeight: 22,
    width: 18,
    textAlign: 'center',
  },
  listContent: {
    flex: 1,
  },
  blockquote: {
    backgroundColor: '#f9f9f9',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: 12,
    paddingVertical: 4,
    marginVertical: 4,
  },
  hr: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 12,
  },
});

const inputStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    marginBottom: 8,
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  textInput: {
    color: colors['text-primary'],
    fontSize: 16,
    maxHeight: 96,
    padding: 0,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: '#f3f4f6',
  },
  sendBtnActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
});
