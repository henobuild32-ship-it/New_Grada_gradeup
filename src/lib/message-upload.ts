export interface MessageUploadResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

export function uploadMessageAttachment(
  formData: FormData,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<MessageUploadResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    if (signal.aborted) {
      reject(new DOMException('Envoi annulé.', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    request.open('POST', '/api/upload/message');
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      signal.removeEventListener('abort', abort);
      let data: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(request.responseText);
        if (parsed && typeof parsed === 'object') data = parsed;
      } catch { /* réponse non JSON : le message HTTP générique sera affiché */ }
      resolve({ ok: request.status >= 200 && request.status < 300, status: request.status, data });
    };
    request.onerror = () => {
      signal.removeEventListener('abort', abort);
      reject(new TypeError('La connexion a été interrompue pendant l’envoi.'));
    };
    request.onabort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Envoi annulé.', 'AbortError'));
    };
    request.send(formData);
  });
}
