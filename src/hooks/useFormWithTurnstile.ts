import { useState, useCallback } from "react";

interface UseFormOptions<T> {
  initialValues: T;
  onSubmit: (values: T, token: string) => Promise<void>;
}

export function useFormWithTurnstile<T extends Record<string, unknown>>({
  initialValues,
  onSubmit,
}: UseFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setValues((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleTurnstileSuccess = useCallback((t: string) => {
    setToken(t);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setToken(null);
    setErrorMsg("Vérification CAPTCHA échouée. Réessaie.");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setToken(null);
    setErrorMsg("Le CAPTCHA a expiré. Valide à nouveau.");
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!token) {
        setErrorMsg("Merci de compléter le CAPTCHA.");
        return;
      }

      setStatus("loading");
      setErrorMsg(null);

      try {
        await onSubmit(values, token);
        setStatus("success");
        setValues(initialValues);
        setToken(null);
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Une erreur est survenue.");
      }
    },
    [token, values, onSubmit, initialValues]
  );

  return {
    values,
    token,
    status,
    errorMsg,
    handleChange,
    handleSubmit,
    handleTurnstileSuccess,
    handleTurnstileError,
    handleTurnstileExpire,
  };
}
