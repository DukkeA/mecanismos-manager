"use client";
import { createContext, useContext } from "react";

export const FormValidationContext = createContext<Record<string, string>>({});
export const useFormErrors = () => useContext(FormValidationContext);
