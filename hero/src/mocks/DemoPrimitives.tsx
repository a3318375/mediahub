import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar as HeroAvatar, Chip } from "@heroui/react";

export function Avatar({
  name = "Kate Moore",
  avatar = "blue-light",
  className = "",
}: {
  name?: string;
  avatar?: string;
  className?: string;
}) {
  return (
    <HeroAvatar className={`avatar ${className}`}>
      <HeroAvatar.Image src={`/avatars/${avatar}.jpg`} alt={name} />
      <HeroAvatar.Fallback>{name.slice(0, 1).toUpperCase()}</HeroAvatar.Fallback>
    </HeroAvatar>
  );
}

export function Growth({
  value = "3.3%",
  negative = false,
  soft = false,
}: {
  value?: string;
  negative?: boolean;
  soft?: boolean;
}) {
  return (
    <Chip size="sm" color={negative ? "danger" : "success"} variant={soft ? "soft" : "primary"}
      className={`growth ${negative ? "negative" : ""} ${soft ? "soft" : ""}`}
    >
      {negative ? <ArrowDown size={11} /> : <ArrowUp size={11} />} {value}
    </Chip>
  );
}
