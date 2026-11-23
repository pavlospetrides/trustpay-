"use client";
import { useCallback, useEffect, useState } from "react";
export function useApi<T>(load:()=>Promise<T>) { const [data,setData]=useState<T|null>(null); const [error,setError]=useState(""); const [loading,setLoading]=useState(true); const refresh=useCallback(async()=>{setLoading(true);setError("");try{setData(await load());}catch(e){setError(e instanceof Error?e.message:"Unable to load data");}finally{setLoading(false);}},[load]); useEffect(()=>{queueMicrotask(()=>void refresh());},[refresh]); return {data,error,loading,refresh,setData}; }
