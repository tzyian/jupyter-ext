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
        mediaRecorder = new MediaRecorder(stream);
      } catch (err) {
        // If MediaRecorder construction fails, stop tracks and propagate error
        stream.getTracks().forEach(track => track.stop());
        console.error('Failed to create MediaRecorder:', err);
        throw err;
      }

      chunksRef.current = [];

      mediaRecorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error: unknown) {
      console.error('Error accessing microphone:', error);
      const errorMessage = error instanceof Error ? error.message : undefined;
      const message = errorMessage
        ? `Could not access microphone: ${errorMessage}`
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
        const mimeType = mediaRecorder.mimeType || chunksRef.current[0]?.type;
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
        const recorderError =
          event instanceof ErrorEvent && event.error
            ? String(event.error)
            : 'Unknown error';
        reject(new Error(`Recording error: ${recorderError}`));
      };

      mediaRecorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
}
