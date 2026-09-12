import { AlertCircle, X } from "lucide-react";

type Props = {
  message: string | null;
  onDismiss?: () => void;
  // The backend error code, shown only as a tooltip - it is for us, not users.
  code?: string;
};

// One consistent box for every error in the app. When the backend ties an
// error to an input, the form also outlines that input.
function ErrorBanner({ message, onDismiss, code }: Props) {
  if (!message) return null;
  return (
    <div className="error-banner" role="alert" title={code}>
      <AlertCircle size={16} className="error-banner-icon" />
      <p>{message}</p>
      {onDismiss && (
        <button
          type="button"
          className="error-banner-close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default ErrorBanner;
