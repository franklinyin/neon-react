interface LoadingOverlayProps {
  visible: boolean;
}

export default function LoadingOverlay({ visible }: LoadingOverlayProps) {
  if (!visible) return null;

  return (
    <div className="overlay" id="loading">
      <div className="loader"></div>
    </div>
  );
}
