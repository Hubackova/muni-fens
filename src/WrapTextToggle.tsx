type Props = {
  wrapped: boolean;
  onToggle: () => void;
};

// Switches its table between clipping long values and wrapping them.
function WrapTextToggle({ wrapped, onToggle }: Props) {
  return (
    <button type="button" className="toolbar-toggle" onClick={onToggle}>
      {wrapped ? "Clip long text" : "Wrap long text"}
    </button>
  );
}

export default WrapTextToggle;
