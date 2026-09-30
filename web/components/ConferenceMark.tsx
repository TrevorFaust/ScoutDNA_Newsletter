const MARKS = {
  AFC: { src: "/conference-afc.png", width: 461, height: 321 },
  NFC: { src: "/conference-nfc.png", width: 240, height: 175 },
} as const;

type Props = {
  conference: "AFC" | "NFC";
};

export function ConferenceMark({ conference }: Props) {
  const mark = MARKS[conference];

  return (
    <img
      className="conference-mark"
      src={mark.src}
      alt={conference}
      width={mark.width}
      height={mark.height}
    />
  );
}
