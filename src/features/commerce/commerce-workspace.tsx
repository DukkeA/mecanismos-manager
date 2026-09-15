"use client";
import type { ComponentProps } from "react";
import { CommercePanel } from "./commerce-panel";
export function CommerceWorkspace(props: ComponentProps<typeof CommercePanel>) {
  return <CommercePanel key={props.section} {...props} />;
}
