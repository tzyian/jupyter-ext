import { useState, useRef, useCallback } from 'react';

interface IUseAudioRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
}

export function useAudioRecorder(): IUseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingMimeTypeRef = useRef<string>('audio/webm');

  const getPreferredMimeType = useCallback((): string | undefined => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/m4a',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];

    for (const mimeType of candidates) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }

    return undefined;
  }, []);

  const startRecording = useCallback(async () => {
    // Feature detection
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg =
        'Browser does not support navigator.mediaDevices.getUserMedia';
      console.error(msg);
      throw new Error(msg);
    }

    if (typeof MediaRecorder === 'undefined') {
      const msg = 'MediaRecorder API is not available in this browser';
      console.error(msg);
      throw new Error(msg);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let mediaRecorder: MediaRecorder;
      try {
        const preferredMimeType = getPreferredMimeType();
        mediaRecorder = preferredMimeType
          ? new MediaRecorder(stream, { mimeType: preferredMimeType })
          : new MediaRecorder(stream);
      } catch (err) {
        // If MediaRecorder construction fails, stop tracks and propagate error
        stream.getTracks().forEach(track => track.stop());
        console.error('Failed to create MediaRecorder:', err);
        throw err;
      }

      chunksRef.current = [];
      recordingMimeTypeRef.current = mediaRecorder.mimeType || 'audio/webm';

      mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error: any) {
      console.error('Error accessing microphone:', error);
      const message =
        error && error.message
          ? `Could not access microphone: ${error.message}`
          : 'Could not access microphone. Please check permissions.';
      throw new Error(message);
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;

      if (!mediaRecorder) {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = () => {
        const mimeType =
          recordingMimeTypeRef.current ||
          chunksRef.current[0]?.type ||
          'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        // Stop all tracks to release microphone
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null;
        setIsRecording(false);
        if (blob.size === 0) {
          reject(new Error('Recorded audio is empty. Please try again.'));
          return;
        }
        resolve(blob);
      };

      mediaRecorder.onerror = (event: Event) => {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current = null;
        setIsRecording(false);
        reject(
          new Error(
            `Recording error: ${(event as any).error || 'Unknown error'}`
          )
        );
      };

      mediaRecorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
}
