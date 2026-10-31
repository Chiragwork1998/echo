import { Slot, usePathname } from "expo-router";
import { useEffect } from "react";
import {
  setCurrentStep,
  type OnboardingStep,
} from "@/state/onboardingSelections";
const STEPS = [
  "intent",
  "horizon",
  "voice",
  "rhythm",
  "privacy",
  "arrival",
  "first-echo",
  "completion",
];
export default function OnboardingLayout() {
  const pathname = usePathname();
  useEffect(() => {
    const index = STEPS.indexOf(pathname.split("/").pop() ?? "");
    if (index >= 0) setCurrentStep((index + 1) as OnboardingStep);
  }, [pathname]);
  return <Slot />;
}
