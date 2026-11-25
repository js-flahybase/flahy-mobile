import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowUp, Plus, Shield, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Header } from '../components/Header';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { API_BASE_URL, WEB_APP_URL, patientApiRoutes } from '../config';
import { RootStackParamList } from '../navigation/types';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { colors } from '../theme/colors';

// NOTE: FLAHY_AI_SYSTEM_PROMPT (constants/flahyAIPrompt.ts) is no longer used
// anywhere in this screen - the backend (flahybase-api-web-app) now owns the
// system prompt and all report extraction. If nothing else in the app imports
// constants/flahyAIPrompt.ts, that file can be deleted. WEB_APP_URL is still
// needed below, for the same /api/html-to-pdf conversion the web client uses.

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  attachment?: { uri: string; mediaType: string; fileName?: string };
};

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
// Screen component
// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<RootStackParamList, 'FlahyAI'>;

// Cap on how many of the user's reports get silently preloaded into the
// session on open - not "all of them" literally (a long-time user could have
// dozens, and every one is a real upload+extraction on the backend before the
// user has typed anything), just a sane ceiling. Matches the web client's
// MAX_PREATTACHED_REPORTS.
const MAX_PRELOADED_REPORTS = 20;

// Only used to name the uploaded file sensibly (and give the upload a
// plausible `type`) - the backend's real extraction pipeline (not this
// client) decides what kind of report it is and how to read it, EXCEPT for
// the JSON/HTML special cases below, which must match the web client's
// handling exactly (see createFileFromReportId in useFlahyAiRuntime.js) -
// uploading those two report types differently is what caused mobile and
// web to give different answers off the same reports.
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

// Mirrors the web client's htmlBlobToPdfFile() - same /api/html-to-pdf route
// on WEB_APP_URL (this Next.js endpoint, not the AdonisJS backend), same
// request shape. Returns the PDF's base64, ready for uploadFlahyAiFile().
async function convertHtmlToPdfBase64(html: string): Promise<string> {
  const res = await ReactNativeBlobUtil.fetch(
    'POST',
    `${WEB_APP_URL}/api/html-to-pdf`,
    { 'Content-Type': 'application/json' },
    JSON.stringify({ html }),
  );
  const status = (res as any).respInfo?.status;
  if (status && status >= 400) {
    throw new Error(`HTML->PDF conversion failed (${status})`);
  }
  return res.base64();
}

const AI_CONSENT_KEY = 'flahy_ai_consent_accepted';

// ---------------------------------------------------------------------------
// FlahyAI backend client (session / upload / chat) - mirrors the web app's
// src/hooks/useFlahyAiRuntime.js against the SAME flahybase-api-web-app
// routes (API_BASE_URL is already this backend - it's what patientApiRoutes
// hits for reports). No streaming: /chat returns one JSON {reply}.
//
// Uploads use react-native-blob-util's multipart form (an array of
// {name, data} / {name, filename, type, data} parts) instead of the DOM
// FormData/File web uses - that's not reliably available in React Native,
// and this screen already depends on ReactNativeBlobUtil for downloads.
// ---------------------------------------------------------------------------

// Uses the shared `api` axios instance (not ReactNativeBlobUtil) - it's a
// plain no-body POST, so it gets the app's normal auth-header/401/network-error
// handling for free. Upload/chat below still need ReactNativeBlobUtil because
// they send multipart file data.
async function createFlahyAiSession(): Promise<string> {
  const res = await api.post('/api/flahyai/session');
  const sessionId = res.data?.session_id;
  if (!sessionId) {
    throw new Error(res.data?.error || 'Failed to create FlahyAI session');
  }
  return sessionId as string;
}

async function uploadFlahyAiFile(
  token: string | null,
  sessionId: string,
  file: { base64: string; mediaType: string; filename: string },
  // 'account' = the user's own saved report preloaded silently; 'chat' = attached by the
  // user in the chat. The backend uses this to choose between explaining the report and
  // running the decision tree.
  source: 'account' | 'chat' = 'chat',
): Promise<void> {
  const res = await ReactNativeBlobUtil.fetch(
    'POST',
    `${API_BASE_URL}/api/flahyai/upload`,
    {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'multipart/form-data',
    },
    [
      { name: 'session_id', data: sessionId },
      { name: 'source', data: source },
      {
        name: 'files',
        filename: file.filename,
        type: file.mediaType,
        data: file.base64,
      },
    ],
  );
  const data = JSON.parse(res.text());
  if (data?.error) {
    throw new Error(data.error);
  }
}

async function sendFlahyAiChat(
  token: string | null,
  sessionId: string,
  message: string,
  // The user has saved reports (known as soon as they are listed, even if their upload
  // hasn't finished) - lets the backend pick the right mode and greeting.
  hasAccountReport = false,
): Promise<string> {
  const res = await ReactNativeBlobUtil.fetch(
    'POST',
    `${API_BASE_URL}/api/flahyai/chat`,
    {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'multipart/form-data',
    },
    [
      { name: 'session_id', data: sessionId },
      { name: 'message', data: message },
      ...(hasAccountReport ? [{ name: 'has_account_report', data: '1' }] : []),
    ],
  );
  const data = JSON.parse(res.text());
  if (data?.error) {
    throw new Error(data.error);
  }
  return data?.reply || '';
}

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
  // Tracks the one assistant message currently awaiting its single JSON
  // reply from /api/flahyai/chat (there's no streaming to accumulate here -
  // its content in the store stays '' until the reply arrives, which is what
  // renderItem below treats as "Thinking...").
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null,
  );
  const [isInitializing, setIsInitializing] = useState(false);

  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);

  // Store messages (with streaming overlay)
  const messages: Message[] = [
    ...storeMessages.map(m => {
      if (m.id === streamingMessageId) {
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          isStreaming: true,
        };
      }
      return { id: m.id, role: m.role, content: m.content, attachment: m.attachment };
    }),
  ];

  // The backend session id - created lazily on first use (mirrors
  // ensureSession() in the web hook) and kept for the lifetime of this screen.
  // All of the user's reports and chat history live server-side against this
  // id, so (unlike the old /api/chat flow) nothing needs to be resent on
  // every turn.
  const sessionIdRef = useRef<string | null>(null);
  const hasAccountReportRef = useRef(false);
  const ensureSession = async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    sessionIdRef.current = await createFlahyAiSession();
    return sessionIdRef.current;
  };

  const [pendingAttachment, setPendingAttachment] = useState<{
    uri: string;
    mediaType: string;
    fileName?: string;
    base64: string;
  } | null>(null);

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
    if (messages.length > 0) {
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
    loadReports();
  }, []);

  // Silently preload every one of the user's reports into the backend session
  // as soon as the screen opens - mirrors the web client's
  // createFilesFromAllReports()+uploadFileToSession() exactly: no client-side
  // parsing, just hand the backend's real /api/flahyai/upload pipeline the
  // raw bytes and let it classify/extract (blood, genetic, HTML, PDF, image)
  // server-side. The chat reply is now what tells the user what was found, so
  // there's no need to echo any "reports loaded" summary here.
  //
  // NOTE: uses patientApiRoutes.getFlahyReports (the SAME listing the web
  // app's dashboard uses to decide "does this user have reports") - NOT
  // patientApiRoutes.reportList, which is the lab-ordered/sample-linked
  // listing used for admin/lab tooling and requires a sample_id. A report the
  // user uploaded themselves has no sample_id and would silently never show
  // up via reportList - exactly the bug this was fixed for on web.
  const loadReports = async () => {
    setIsInitializing(true);
    try {
      const token = useAuthStore.getState().token;
      if (!token) {
        return;
      }

      const listResponse = await api.get(patientApiRoutes.getFlahyReports);
      const reports = listResponse.data?.data;
      if (!reports || reports.length === 0) {
        return;
      }

      hasAccountReportRef.current = true;
      await ensureSession();
      let uploaded = 0;
      for (const reportMeta of reports.slice(0, MAX_PRELOADED_REPORTS)) {
        const fileName: string =
          reportMeta.file_name || `report-${reportMeta.id}`;
        try {
          const downloadUrl = `${API_BASE_URL}${patientApiRoutes.downloadReport}/${reportMeta.id}`;
          const downloadResponse = await ReactNativeBlobUtil.fetch(
            'GET',
            downloadUrl,
            { Authorization: `Bearer ${token}` },
          );

          const respHeaders = (downloadResponse as any).respInfo?.headers;
          const headerCT = normalizeContentType(
            pickHeader(respHeaders, 'content-type') ||
              pickHeader(respHeaders, 'Content-Type') ||
              '',
          );
          const nameCT = normalizeContentType(getMimeTypeFromName(fileName));
          const effectiveCT = headerCT || nameCT;

          let sample = '';
          try {
            sample = ((downloadResponse as any).text?.() ?? '').slice(0, 2048);
          } catch {
            // binary content - sniffing just won't match HTML/JSON, which is correct
          }

          // Same precedence as the web client's createFileFromReportId(): JSON
          // first, then HTML, then upload as-is. A JSON report is skipped
          // entirely (not uploaded) to match web's current behavior exactly -
          // this is a known gap (see the standing note to the user about it),
          // not an intentional design choice, but matching it is what keeps
          // both clients giving the same answer for the same reports.
          if (effectiveCT === 'application/json' || looksLikeJson(sample)) {
            console.log(`[FlahyAI] skipping JSON report "${fileName}" (not uploaded, matches web)`);
            continue;
          }

          if (effectiveCT === 'text/html' || looksLikeHtml(sample)) {
            try {
              const html = sample.length >= 2048 ? downloadResponse.text() : sample;
              const pdfBase64 = await convertHtmlToPdfBase64(html);
              await uploadFlahyAiFile(
                token,
                sessionIdRef.current as string,
                {
                  base64: pdfBase64,
                  mediaType: 'application/pdf',
                  filename: `${fileName.replace(/\.(html?|htm)$/i, '')}.pdf`,
                },
                'account',
              );
              uploaded++;
            } catch (err: any) {
              // Same fallback as web: if PDF conversion fails, upload the raw
              // HTML instead (the backend reads .html directly) so the report
              // still reaches FlahyAI.
              console.error(
                `HTML->PDF conversion failed for "${fileName}", uploading HTML instead:`,
                err?.message,
              );
              try {
                await uploadFlahyAiFile(
                  token,
                  sessionIdRef.current as string,
                  {
                    base64: downloadResponse.base64(),
                    mediaType: 'text/html',
                    filename: fileName.match(/\.(html?|htm)$/i)
                      ? fileName
                      : `${fileName}.html`,
                  },
                  'account',
                );
                uploaded++;
              } catch (htmlErr: any) {
                console.error(
                  `HTML upload failed for "${fileName}":`,
                  htmlErr?.message,
                );
              }
            }
            continue;
          }

          await uploadFlahyAiFile(
            token,
            sessionIdRef.current as string,
            {
              base64: downloadResponse.base64(),
              mediaType: effectiveCT,
              filename: fileName,
            },
            'account',
          );
          uploaded++;
        } catch (err: any) {
          console.error(`Failed to preload report "${fileName}":`, err?.message);
        }
      }
      console.log('[FlahyAI] reports preloaded:', uploaded, 'of', reports.length);
    } catch (error: any) {
      console.error('Failed to load reports:', error?.message);
    } finally {
      setIsInitializing(false);
    }
  };

  // Max raw photo size accepted for a chat attachment. No image-resize
  // library exists in this app today, so we simply reject oversized photos
  // rather than compressing them.
  const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

  const normalizeFsPath = (uri: string) => {
    // react-native-blob-util expects a filesystem path, not a file:// URI.
    // iOS image-picker returns file:///... which otherwise fails with
    // "No such file 'file:...'".
    let path = uri;
    if (path.startsWith('file://')) {
      path = path.replace('file://', '');
    }
    try {
      path = decodeURIComponent(path);
    } catch {
      // keep original if decode fails
    }
    return path;
  };

  const readAttachmentAsset = async (asset: {
    uri?: string;
    fileName?: string;
    type?: string;
    fileSize?: number;
    base64?: string;
  }) => {
    if (!asset.uri) return;

    try {
      let base64 = asset.base64;
      if (!base64) {
        const path = normalizeFsPath(asset.uri);
        base64 = await ReactNativeBlobUtil.fs.readFile(path, 'base64');
      }

      const approxBytes = asset.fileSize ?? base64.length * 0.75;
      if (approxBytes > MAX_ATTACHMENT_BYTES) {
        Alert.alert('Photo Too Large', 'Please choose a photo under 8MB.');
        return;
      }

      setPendingAttachment({
        uri: asset.uri,
        mediaType: asset.type || 'image/jpeg',
        fileName: asset.fileName,
        base64,
      });
    } catch (err) {
      console.error('Failed to read attachment:', err);
      Alert.alert('Error', 'Could not load that photo. Please try again.');
    }
  };

  const handleGalleryAttach = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      includeBase64: true,
    });
    if (result.assets && result.assets[0]) {
      await readAttachmentAsset(result.assets[0]);
    }
  };

  const handleCameraAttach = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'Flahy needs access to your camera to take photos.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
          return;
        }
      } catch (err) {
        console.warn(err);
        return;
      }
    }

    const result = await launchCamera({
      mediaType: 'photo',
      saveToPhotos: true,
      includeBase64: true,
    });
    if (result.assets && result.assets[0]) {
      await readAttachmentAsset(result.assets[0]);
    }
  };

  const handleAttachPress = () => {
    Alert.alert('Add Photo', 'Choose source', [
      { text: 'Camera', onPress: handleCameraAttach },
      { text: 'Photo Library', onPress: handleGalleryAttach },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const sendMessage = async (text: string = inputText) => {
    const msgText = text.trim();
    if ((!msgText && !pendingAttachment) || isLoading) return;

    const attachmentToSend = pendingAttachment;
    const userMsgId = Date.now().toString();
    const userMsg = {
      id: userMsgId,
      role: 'user' as const,
      content: msgText,
      ...(attachmentToSend
        ? {
            attachment: {
              uri: attachmentToSend.uri,
              mediaType: attachmentToSend.mediaType,
              fileName: attachmentToSend.fileName,
            },
          }
        : {}),
    };

    storeAddMessage(userMsg);
    setInputText('');
    setPendingAttachment(null);
    setIsLoading(true);

    const aiMsgId = (Date.now() + 1).toString();

    try {
      const token = useAuthStore.getState().token;

      // Add placeholder assistant message to store - shown as "Thinking..."
      // (see renderItem below) until the single reply below arrives. There's
      // no streaming anymore: /api/flahyai/chat returns one JSON {reply}.
      storeAddMessage({ id: aiMsgId, role: 'assistant', content: '' });
      setStreamingMessageId(aiMsgId);

      const sessionId = await ensureSession();

      // Upload a freshly-picked photo first (same order as the web
      // attachment adapter: upload, then the chat turn can see it) - the
      // backend session remembers it from here on, so unlike the old
      // /api/chat flow, nothing needs to be resent on every future turn.
      if (attachmentToSend) {
        await uploadFlahyAiFile(token, sessionId, {
          base64: attachmentToSend.base64,
          mediaType: attachmentToSend.mediaType,
          filename: attachmentToSend.fileName || 'photo.jpg',
        });
      }

      const replyText = await sendFlahyAiChat(
        token,
        sessionId,
        msgText,
        hasAccountReportRef.current,
      );
      storeUpdateMessage(aiMsgId, {
        content: replyText || 'No response received.',
      });
    } catch (error: any) {
      console.error('FlahyAI Chat Error:', error);
      storeUpdateMessage(aiMsgId, {
        content: `Error: ${error?.message || 'Something went wrong.'}`,
      });
    } finally {
      setStreamingMessageId(null);
      setIsLoading(false);
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
      className="flex-1 bg-card"
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
                Your data is sent to third-party AI service providers whose
                large language models power FlahyAI. These models are aligned
                to Flahy’s clinical logic: they work within Flahy’s
                interpretation frameworks and guardrails rather than generating
                open-ended responses. Your data is used solely to generate
                responses and health-related insights within FlahyAI.
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
                    `${WEB_APP_URL}/privacy-policy-mobile`,
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

      <Header showBack={true} onBack={() => navigation.goBack()} minimal />

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
          keyboardVerticalOffset={0}
          style={{ flex: 1 }}
        >
          <View className="flex-1 px-4">
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
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
              renderItem={({ item }) => (
                <View
                  className={`flex-row mb-4 ${
                    item.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <View
                    className={
                      item.role === 'user'
                        ? 'px-4 py-2.5 max-w-[80%] rounded-3xl bg-surface'
                        : 'flex-1 py-1'
                    }
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
                    ) : (
                      <>
                        {item.attachment && (
                          <Image
                            source={{ uri: item.attachment.uri }}
                            style={{
                              width: 180,
                              height: 180,
                              borderRadius: 12,
                              marginBottom: item.content ? 8 : 0,
                            }}
                            resizeMode="cover"
                          />
                        )}
                        {item.content ? (
                          <Text style={md.userText}>
                            {item.content}
                          </Text>
                        ) : null}
                      </>
                    )}
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
            {pendingAttachment && (
              <View style={inputStyles.attachmentPreviewRow}>
                <Image
                  source={{ uri: pendingAttachment.uri }}
                  style={inputStyles.attachmentPreviewImage}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={() => setPendingAttachment(null)}
                  style={inputStyles.attachmentRemoveBtn}
                >
                  <X size={14} color="white" />
                </TouchableOpacity>
              </View>
            )}
            <View style={inputStyles.bar}>
              <TouchableOpacity
                style={inputStyles.iconCircle}
                onPress={handleAttachPress}
              >
                <Plus size={24} color={colors['text-primary']} />
              </TouchableOpacity>
              <View style={inputStyles.pill}>
                <View style={inputStyles.inputWrap}>
                  <TextInput
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Ask FlahyAI"
                    placeholderTextColor={colors['text-secondary']}
                    style={[
                      inputStyles.textInput,
                      // iOS keeps the old multiline height when the value is
                      // cleared programmatically, so pin it while empty.
                      Platform.OS === 'ios' && !inputText && inputStyles.textInputEmpty,
                    ]}
                    textAlignVertical="center"
                    multiline
                  />
                </View>
                <TouchableOpacity
                  onPress={() => sendMessage()}
                  disabled={isLoading || (!inputText.trim() && !pendingAttachment)}
                  style={[
                    inputStyles.sendBtn,
                    isLoading || (!inputText.trim() && !pendingAttachment)
                      ? inputStyles.sendBtnDisabled
                      : inputStyles.sendBtnActive,
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator color={colors['text-primary']} size="small" />
                  ) : (
                    <ArrowUp size={20} color="white" strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              </View>
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
    fontSize: 17,
    lineHeight: 25,
  },
  userText: {
    color: colors['text-primary'],
    fontSize: 17,
    lineHeight: 24,
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  inlineCode: {
    backgroundColor: colors.surface,
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
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
    color: colors['text-primary'],
  },
  h2: {
    fontSize: 21,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 4,
    color: colors['text-primary'],
  },
  h3: {
    fontSize: 19,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 2,
    color: colors['text-primary'],
  },
  paragraph: {
    marginBottom: 6,
  },
  codeBlock: {
    backgroundColor: colors.surface,
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
    fontSize: 17,
    lineHeight: 25,
    width: 18,
    textAlign: 'center',
  },
  listContent: {
    flex: 1,
  },
  blockquote: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    paddingLeft: 12,
    paddingVertical: 4,
    marginVertical: 4,
  },
  hr: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
});

const inputStyles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 48,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  attachmentPreviewRow: {
    position: 'relative',
    alignSelf: 'flex-start',
    width: 64,
    height: 64,
    marginHorizontal: 8,
    marginBottom: 8,
  },
  attachmentPreviewImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  attachmentRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    paddingVertical: 7,
    paddingRight: 8,
    justifyContent: 'center',
  },
  textInput: {
    color: colors['text-primary'],
    fontSize: 17,
    maxHeight: 120,
    padding: 0,
  },
  textInputEmpty: {
    height: 22,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors['surface-strong'],
  },
  sendBtnActive: {
    backgroundColor: colors.teal,
  },
});
