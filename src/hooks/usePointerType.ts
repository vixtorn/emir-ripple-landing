"use client";
import { useEffect, useState } from "react";
export function usePointerType() { const [isTouch, setIsTouch] = useState(false); useEffect(() => { const query = window.matchMedia("(pointer: coarse)"); const change = () => setIsTouch(query.matches); change(); query.addEventListener("change", change); return () => query.removeEventListener("change", change); }, []); return isTouch; }
