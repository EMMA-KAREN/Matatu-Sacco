import { useEffect, useState } from "react";
import API from "../api";

const DEFAULT_SACCO = {
  sacco_name: "2KM SACCO",
  location: "",
  po_box: "",
  phone_number: "",
};

export default function useSacco() {
  const [sacco, setSacco] = useState(DEFAULT_SACCO);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API}/settings/sacco`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !Array.isArray(data)) setSacco((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, []);

  return sacco;
}