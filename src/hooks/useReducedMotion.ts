"use client";
import { useEffect, useState } from "react";
export function useReducedMotion() { const [reduced, setReduced] = useState(false); useEffect(() => { const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const change = () => setReduced(query.matches); change(); query.addEventListener("change", change); return () => query.removeEventListener("change", change); }, []); return reduced; }
