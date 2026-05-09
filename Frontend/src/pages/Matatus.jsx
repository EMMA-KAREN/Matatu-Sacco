import { useState, useEffect } from "react";
import API from "../api";

const DOCUMENT_TYPES = [
  "Driving License",
  "PSV Badge",
  "Insurance",
  "Inspection",
  "TLB"
];

export default function Matatu() {
  const [matatus, setMatatus] = useState([]);
  const [selectedMatatu, setSelectedMatatu] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [owners, setOwners] = useState([]);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  
  const [form, setForm] = useState({
    plate: "",
    owner_member_no: "", 
    driver_name: "",
    driver_id: "",
    has_conductor: false,
    conductor_id: "",
    documents: []
  });

  // ================= FETCH =================
  useEffect(() => {
  // Fetch matatus
  fetch(`${API}/matatus`)
    .then(res => res.json())
    .then(data => setMatatus(data));

  // Fetch owners
  fetch(`${API}/owners`)
    .then(res => res.json())
    .then(data => setOwners(data));
}, []);

  // ================= HELPERS =================
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === "checkbox" ? checked : value });
  };
   const isTypeUsed = (type, index, docs) => {
    return docs.some((d, i) => d.type === type && i !== index);
  };

  const addDocument = () => {
  if (editMode) {
    if (selectedMatatu.documents.length >= 5) {
      alert("Maximum 5 documents allowed!");
      return;
    }

    setSelectedMatatu({
      ...selectedMatatu,
      documents: [
        ...selectedMatatu.documents,
        { number: "", type: "", issue: "", expiry: "", file: null }
      ]
    });

  } else {
    if (form.documents.length >= 5) {
      alert("Only 5 document types allowed!");
      return;
    }

    setForm({
      ...form,
      documents: [
        ...form.documents,
        { number: "", type: "", issue: "", expiry: "", file: null }
      ]
    });
  }
};

// updateDocument

const updateDocument = (index, field, value) => {
  const docs = editMode ? [...selectedMatatu.documents] : [...form.documents];

  if (field === "type") {
    const exists = docs.some((d, i) => d.type === value && i !== index);
    if (exists) {
      alert("❌ This document type already exists!");
      return;
    }
  }

  docs[index][field] = value;

  if (editMode) {
    setSelectedMatatu({ ...selectedMatatu, documents: docs });
  } else {
    setForm({ ...form, documents: docs });
  }
};

//  Update file upload handler
 const handleFileUpload = (index, file) => {
  const docs = editMode ? [...selectedMatatu.documents] : [...form.documents];

  if (docs[index].file && !(docs[index].file instanceof File)) {
    const confirmReplace = window.confirm("Replace existing document?");
    if (!confirmReplace) return;
  }

  docs[index].file = file;

  if (editMode) {
    setSelectedMatatu({ ...selectedMatatu, documents: docs });
  } else {
    setForm({ ...form, documents: docs });
  }
};


  const getStatus = (expiry) => {
    if (!expiry) return "Missing";
    const today = new Date();
    const exp = new Date(expiry);
    const diff = (exp - today) / (1000 * 60 * 60 * 24);
    if (diff < 0) return "Expired";
    if (diff < 7) return "Near Expiry";
    return "Valid";
  };

  const getStatusColor = (status) => {
    if (status === "Expired" || status === "Missing") return "text-red-600";
    if (status === "Near Expiry") return "text-yellow-500";
    return "text-green-600";
  };

  // ================= CREATE =================
const handleSubmit = async (e) => {
  e.preventDefault();

  if (!form.owner_member_no) {
    alert("Please select an owner");
    return;
  }

  const token = localStorage.getItem("token");

  console.log("TOKEN BEING SENT:", token); // 👈 ADD THIS

  // if (!token || token === "undefined" || token === "null") {
  //   alert("Session expired. Please login again.");
  //   return;
  // }

  const formData = new FormData();
  formData.append("plate", form.plate);
  formData.append("owner_member_no", form.owner_member_no);
  formData.append("driver_name", form.driver_name);
  formData.append("driver_id", form.driver_id);
  formData.append("conductor_id", form.has_conductor ? form.conductor_id : "");

  form.documents.forEach((doc, i) => {
    formData.append(`documents[${i}][number]`, doc.number);
    formData.append(`documents[${i}][type]`, doc.type);
    formData.append(`documents[${i}][issue]`, doc.issue);
    formData.append(`documents[${i}][expiry]`, doc.expiry);

    if (doc.file) {
      formData.append(`documents[${i}][file]`, doc.file);
    }
  });

  try {
  const res = await fetch(`${API}/matatus`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: formData
});

const data = await res.json();

// 👇 ADD HERE
if (res.status === 401) {
  alert("Session expired. Please log in again.");
  localStorage.removeItem("token");
  window.location.href = "/login";
  return;
}

if (!res.ok) {
  alert(data.error || "Failed to create matatu");
  return;
} 
    const updated = await fetch(`${API}/matatus`);
    const matatusData = await updated.json();
    setMatatus(matatusData);

    setShowForm(false);

    setForm({
      plate: "",
      owner_member_no: "",
      driver_name: "",
      driver_id: "",
      has_conductor: false,
      conductor_id: "",
      documents: []
    });

    setOwnerSearch("");

  } catch (err) {
    console.error(err);
    alert("Network error. Check backend.");
  }
};


  // ================= DELETE Matatu =================
 const deleteMatatu = async (id) => {
  const token = localStorage.getItem("token");

  if (!token || token === "undefined") {
    alert("Session expired. Please login again.");
    return;
  }

  try {
    const res = await fetch(`${API}/matatus/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await res.json();

  // 👇 ADD HERE
    if (res.status === 401) {
      alert("Session expired. Please log in again.");
      localStorage.removeItem("token");
      window.location.href = "/login";
      return;
    }

    if (!res.ok) {
      alert(data.error || "Failed to create matatu");
      return;
    }

    setMatatus(matatus.filter((m) => m.id !== id));
    setSelectedMatatu(null);
    setShowModal(false);

  } catch (err) {
    console.error(err);
    alert("Network error");
  }
};


  // ================= UPDATE =================
const updateMatatu = async () => {
const token = localStorage.getItem("token");

if (!token || token === "undefined") {
  alert("Session expired. Please login again.");
  return;
}
  const formData = new FormData();

  formData.append("plate", selectedMatatu.plate);
  formData.append("owner_member_no", selectedMatatu.owner_member_no);
  formData.append("driver_name", selectedMatatu.driver_name);
  formData.append("driver_id", selectedMatatu.driver_id);
  formData.append("conductor_id", selectedMatatu.conductor_id || "");

  selectedMatatu.documents.forEach((doc, i) => {
    formData.append(`documents[${i}][number]`, doc.number);
    formData.append(`documents[${i}][type]`, doc.type);
    formData.append(`documents[${i}][issue]`, doc.issue);
    formData.append(`documents[${i}][expiry]`, doc.expiry);

 if (doc.file instanceof File) {
  // New file selected → send the file
  formData.append(`documents[${i}][file]`, doc.file);
} else if (doc.file && typeof doc.file === "string") {
  // Existing file → send just the URL string
  formData.append(`documents[${i}][existing_file]`, doc.file);
}
  });

  const xhr = new XMLHttpRequest();

  xhr.open("PUT", `${API}/matatus/${selectedMatatu.id}`);
  xhr.setRequestHeader("Authorization", `Bearer ${token}`);

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded * 100) / e.total);
      setUploadProgress(percent);
    }
  };

  xhr.onload = () => {
    const data = JSON.parse(xhr.responseText);

     if (xhr.status === 401) {
    alert("Session expired. Please log in again.");
    localStorage.removeItem("token");
    window.location.href = "/login";
    return;
  }

  if (xhr.status !== 200) {
    alert(data.error || "Update failed");
    return;
  }

    fetch(`${API}/matatus`)
      .then((res) => res.json())
      .then((data) => setMatatus(data));

    setSelectedMatatu(null);
    setShowModal(false);
    setEditMode(false);
    setUploadProgress(0);
  };

  xhr.send(formData);
};


  // ================= TICKETING =================
  // const issueTicket = async (matatuId) => {
  //   const res = await fetch("http://localhost:5000/tickets", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({ matatu_id: matatuId, amount: 200, from_shimo: true })
  //   });
  //   const data = await res.json();
  //   setTickets([...tickets, data]);
  // };

  // ================= PRINT TLB =================
 const printTLB = (doc) => {
  if (!doc.file) return alert("No TLB document uploaded!");

  const fileUrl = typeof doc.file === "string"
    ? (doc.file.startsWith("http") ? doc.file : `${API}/uploads/${doc.file}`)
    : URL.createObjectURL(doc.file);

  const fileType = getFileType(fileUrl);
  const printWindow = window.open("", "_blank");

  if (fileType === "image") {
    printWindow.document.write(`
      <html>
        <body style="margin:0">
          <img src="${fileUrl}" style="width:100%" onload="window.print()" />
        </body>
      </html>
    `);
  } else {
    printWindow.document.write(`
      <html>
        <body style="margin:0">
          <iframe
            src="https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true"
            style="width:100%;height:100vh;border:none"
          ></iframe>
          <script>
            setTimeout(() => window.print(), 3000);
          </script>
        </body>
      </html>
    `);
  }

  printWindow.document.close();
};


  // ================= FILTER =================
  const filteredMatatus = matatus.filter(m =>
    m.plate?.toLowerCase().includes(search.toLowerCase())
  );

  // Add Filtered Owners
  const filteredOwners = owners.filter(owner =>
  owner.membership_no?.toLowerCase().includes(ownerSearch.toLowerCase()) ||
  owner.name?.toLowerCase().includes(ownerSearch.toLowerCase())
);

  // Delete a single document
  const removeDocument = (index) => {
    const confirmDelete = window.confirm("Delete this document?");
    if (!confirmDelete) return;

    const updatedDocs = selectedMatatu.documents.filter((_, i) => i !== index);
    setSelectedMatatu({ ...selectedMatatu, documents: updatedDocs });
  };
// Helper to detect file type from URL
  const getFileType = (url) => {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) return "image";
    if (lower.match(/\.pdf(\?|$)/)) return "pdf";
    return "other"; // docx, xlsx, etc
  };
  
  return (
   <div className="p-6 bg-gray-50 min-h-screen">
       <h1 className="text-3xl font-bold mb-6 text-gray-800">Matatu Management</h1>

      {/* SEARCH */}
      <input
        placeholder="Search by plate..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="border p-2 mb-4 w-full"
      />

      {/* ADD NEW MATATU */}
      <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 text-white px-4 py-2 mb-4">
        + Register New Matatu
      </button>

      {showForm && (
        <form onSubmit={handleSubmit} className="border p-4 mb-6 rounded bg-gray-50">
          <input name="plate" placeholder="Plate Number" value={form.plate} onChange={handleChange} className="border p-2 m-1" />
         {/* <select
  name="owner_member_no"
  value={form.owner_member_no}
  onChange={handleChange}
  className="border p-2 m-1"
>
  <option value="">Select Owner</option>
  {owners.map(o => (
    <option key={o.id} value={o.member_no}>
      {o.name} - {o.member_no}
    </option>
  ))}
</select> */}
<div className="relative w-full md:w-[300px]">
  <input
    type="text"
    placeholder="Search Owner by Name or Member No"
    value={ownerSearch}
    onChange={(e) => {
      setOwnerSearch(e.target.value);
      setShowOwnerDropdown(true);
    }}
    onFocus={() => setShowOwnerDropdown(true)}
    className="border p-2 m-1 w-full"
  />

  {showOwnerDropdown && ownerSearch && (
    <div className="absolute z-50 bg-white border w-full max-h-60 overflow-y-auto shadow-lg rounded">
      {filteredOwners.length > 0 ? (
        filteredOwners.map((owner) => (
          <div
            key={owner.id}
            onClick={() => {
              setForm({
                ...form,
                owner_member_no: owner.membership_no
              });

              setOwnerSearch(`${owner.name} - ${owner.membership_no}`);
              setShowOwnerDropdown(false);
            }}
            className="p-2 hover:bg-blue-100 cursor-pointer border-b"
          >
            <p className="font-semibold">{owner.name}</p>
            <p className="text-sm text-gray-500">{owner.membership_no}</p>
          </div>
        ))
      ) : (
        <div className="p-2 text-gray-500">
          No owner found
        </div>
      )}
    </div>
  )}
</div>

          <input name="driver_name" placeholder="Driver Full Name" value={form.driver_name} onChange={handleChange} className="border p-2 m-1" />
          <input name="driver_id" placeholder="Driver ID" value={form.driver_id} onChange={handleChange} className="border p-2 m-1" />

          <label>
            <input type="checkbox" name="has_conductor" checked={form.has_conductor} onChange={handleChange} /> Has Conductor?
          </label>

          {form.has_conductor && (
            <input name="conductor_id" placeholder="Conductor ID" value={form.conductor_id} onChange={handleChange} className="border p-2 m-1" />
          )}

          <h3 className="mt-3 font-semibold">Documents</h3>
          {form.documents.map((doc, i) => (
            <div key={i} className="flex flex-col gap-2 border p-2 mt-2">
              <input type="text" placeholder="Document Number" value={doc.number || ""} onChange={(e) => updateDocument(i, "number", e.target.value)} className="border p-2" />
              <select value={doc.type || ""} onChange={(e) => updateDocument(i, "type", e.target.value)} className="border p-2">
                <option value="">Type</option>
                <option>Driving License</option>
                <option>PSV Badge</option>
                <option>Insurance</option>
                <option>Inspection</option>
                <option>TLB</option>
              </select>
              <input type="date" value={doc.issue || ""} onChange={(e) => updateDocument(i, "issue", e.target.value)} className="border p-2" />
              <input type="date" value={doc.expiry || ""} onChange={(e) => updateDocument(i, "expiry", e.target.value)} className="border p-2" />
              <input type="file" onChange={(e) => handleFileUpload(i, e.target.files[0])} className="border p-2" />
            </div>
          ))}
          <button type="button" onClick={addDocument} className="bg-gray-500 text-white px-2 py-1 mt-2">Add Document</button>
          <button type="submit" className="bg-green-600 text-white px-4 py-2 mt-4">Save</button>
        </form>
      )}

      {/* LIST */}
      <h2 className="text-xl font-bold">Matatu List</h2>
      {filteredMatatus.map((m) => (
        <div key={m.id} className="border p-3 mt-2 cursor-pointer hover:bg-gray-100" onClick={() => { setSelectedMatatu(m); setShowModal(true); setEditMode(false); }}>
          🚐 {m.plate}
        </div>
      ))}

      {/* MODAL */}
      {showModal && selectedMatatu && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-start pt-20 z-50">
          <div className="bg-white p-6 rounded w-[600px] max-h-[90vh] overflow-y-auto relative">

            <h2 className="text-xl font-bold mb-3">{editMode ? "Edit Matatu" : "Matatu Details"}</h2>

            {!editMode ? (
              <>
                <p><b>Plate:</b> {selectedMatatu.plate}</p>
                <p><b>Owner Members no:</b> {selectedMatatu.owner_member_no}</p>
                <p><b>Driver:</b> {selectedMatatu.driver_name}</p>
                <p><b>Driver ID:</b> {selectedMatatu.driver_id}</p>
                <p><b>Conductor:</b> {selectedMatatu.conductor_id || "None"}</p>

                <h4 className="mt-3 font-semibold">Documents</h4>
                {selectedMatatu.documents?.map((doc, i) => {
                  const status = getStatus(doc.expiry);
                 const fileUrl = doc.file
  ? (typeof doc.file === "string"
      ? (doc.file.startsWith("http") ? doc.file : `${API}/uploads/${doc.file}`)
      : URL.createObjectURL(doc.file))
  : null;

                  return (
                    <div key={i} className="border p-2 mt-2 relative flex flex-col gap-2">
                      {status === "Expired" && <div className="absolute top-0 right-0 bg-red-600 text-white px-2 py-1 text-xs font-bold z-10">Expired</div>}
                      <div className="flex justify-between items-center">
                        <span><b>{doc.type}</b> ({doc.number || "No Number"})</span>
                        <span className={getStatusColor(status)}>{status}</span>
                      </div>
                      <div className="flex gap-4">
                        <span>Issue: {doc.issue || "N/A"}</span>
                        <span>Expiry: {doc.expiry || "N/A"}</span>
                      </div>

                       {fileUrl && (() => {
                        const fileType = getFileType(fileUrl);
                        return (
                          <>
                            {fileType === "image" && (
                              <img src={fileUrl} alt={doc.type} className="w-full h-60 object-contain cursor-zoom-in" onClick={() => window.open(fileUrl, "_blank")} />
                            )}
                            {fileType === "pdf" && (
                              <iframe src={fileUrl} className="w-full h-60 border" title={doc.type} />
                            )}
                            {fileType === "other" && (
                              <div className="bg-gray-100 border p-4 rounded text-center">
                                <p className="text-gray-600 mb-2">📄 {doc.type} document</p>
                                <a  href={`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`}
      target="_blank"
      rel="noreferrer"
      className="bg-blue-600 text-white px-3 py-1 rounded"
    >
                                  Open Document
                                </a>
                              </div>
                            )}
                            {doc.type === "TLB" && (
                              <button onClick={() => printTLB(doc)} className="bg-purple-600 text-white px-2 py-1 mt-2">Print TLB</button>
                            )}
                            <a href={fileUrl.replace("/upload/", "/upload/fl_attachment/")}
  target="_blank"
  rel="noreferrer"
  className="bg-gray-600 text-white px-2 py-1 mt-2 w-fit block"
>Download</a>
                          </>
                        );
                      })()}
                      
                      
                    </div>
                  );
                })}
                {/* PROGRESS BAR */}
                  {uploadProgress > 0 && (
                    <div className="w-full bg-gray-200 h-3 rounded mt-3">
                      <div
                        className="bg-green-600 h-3 rounded"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                  )}
                <div className="mt-4 flex gap-2">
                  <button onClick={() => setEditMode(true)} className="bg-yellow-500 text-white px-3 py-1">Update</button>
                  <button onClick={() => deleteMatatu(selectedMatatu.id)} className="bg-red-600 text-white px-3 py-1">Delete</button>
                  <button onClick={() => setShowModal(false)} className="bg-gray-500 text-white px-3 py-1">Close</button>
                </div>
              </>
            ) : (
              <>
                {/* Edit Mode: editable inputs */}
              
                 <div className="bg-green-600 h-3 rounded"style={{ width: `${uploadProgress}%` }} ></div> 
                 <label>Plate</label>
                <input value={selectedMatatu.plate} onChange={(e)=>setSelectedMatatu({...selectedMatatu, plate:e.target.value})} className="border p-2 w-full mb-2"/>

                <label>Owner Members no</label>
                <input value={selectedMatatu.owner_member_no} onChange={(e)=>setSelectedMatatu({...selectedMatatu, owner_member_no:e.target.value})} className="border p-2 w-full mb-2"/>

                <label>Driver Name</label>
                <input value={selectedMatatu.driver_name||""} onChange={(e)=>setSelectedMatatu({...selectedMatatu, driver_name:e.target.value})} className="border p-2 w-full mb-2"/>

                <label>Driver ID</label>
                <input value={selectedMatatu.driver_id} onChange={(e)=>setSelectedMatatu({...selectedMatatu, driver_id:e.target.value})} className="border p-2 w-full mb-2"/>

                <label>Conductor ID</label>
                <input value={selectedMatatu.conductor_id||""} onChange={(e)=>setSelectedMatatu({...selectedMatatu, conductor_id:e.target.value})} className="border p-2 w-full mb-2"/>
                <br></br>
                 

                {/* Document editing with preview and visual cues */}
              {selectedMatatu.documents?.map((doc, i) => {
                 const status = getStatus(doc.expiry);
                const fileUrl = doc.file
  ? (typeof doc.file === "string"
      ? (doc.file.startsWith("http") ? doc.file : `${API}/uploads/${doc.file}`)
      : URL.createObjectURL(doc.file))
  : null;

                    let bgColor = "bg-white";
                    if (!doc.number || !doc.type || !doc.expiry) bgColor = "bg-red-200";
                    else if (status === "Near Expiry") bgColor = "bg-yellow-200";
                    else if (status === "Expired") bgColor = "bg-red-300";

                    return (
                      <div key={i} className={`border p-2 mt-2 ${bgColor} flex flex-col gap-2 relative`}>

                        {/* EXPIRED BADGE */}
                        {status === "Expired" && (
                          <div className="absolute top-0 right-0 bg-red-600 text-white px-2 py-1 text-xs font-bold z-10">
                            Expired
                          </div>
                        )}

                        {/* FILE PREVIEW */}
                        {fileUrl && (() => {
                            const fileType = getFileType(fileUrl);
                            return (
                              <>
                                {fileType === "image" && (
                                  <img src={fileUrl} alt={doc.type} className="w-full h-60 object-contain cursor-zoom-in" onClick={() => window.open(fileUrl, "_blank")} />
                                )}
                                {fileType === "pdf" && (
                                  <iframe src={fileUrl} className="w-full h-60 border" title={doc.type} />
                                )}
                                {fileType === "other" && (
                                  <div className="bg-gray-100 border p-4 rounded text-center">
                                    <p className="text-gray-600 mb-2">📄 {doc.type} document</p>
                                    <a   href={`https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-blue-600 text-white px-3 py-1 rounded"
                              >
                                      Open Document
                                    </a>
                                  </div>
                                )}
                                {doc.type === "TLB" && (
                                  <button onClick={() => printTLB(doc)} className="bg-purple-600 text-white px-2 py-1 mt-2">Print TLB</button>
                                )}
                                <a href={fileUrl.replace("/upload/", "/upload/fl_attachment/")}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-gray-600 text-white px-2 py-1 mt-2 w-fit block"
                          >Download</a>
                              </>
                            );
                          })()}

                        {/* INPUTS */}
                        <input
                          value={doc.number || ""}
                          placeholder="Document Number"
                          onChange={(e) => updateDocument(i, "number", e.target.value)}
                          className="border p-2 w-full"
                        />

                        <select
                          value={doc.type || ""}
                          onChange={(e) => updateDocument(i, "type", e.target.value)}
                          className="border p-2 w-full"
                        >
                          <option value="">Select Type</option>
                          <option>Driving License</option>
                          <option>PSV Badge</option>
                          <option>Insurance</option>
                          <option>Inspection</option>
                          <option>TLB</option>
                        </select>

                        <input
                          type="date"
                          value={doc.issue || ""}
                          onChange={(e) => updateDocument(i, "issue", e.target.value)}
                          className="border p-2 w-full"
                        />

                        <input
                          type="date"
                          value={doc.expiry || ""}
                          onChange={(e) => updateDocument(i, "expiry", e.target.value)}
                          className="border p-2 w-full"
                        />

                        <input
                          type="file"
                          onChange={(e) => handleFileUpload(i, e.target.files[0])}
                          className="border p-2 w-full"
                        />

                        {/*  DELETE BUTTON document */}
                        <button
                          type="button"
                          onClick={() => removeDocument(i)}
                          className="bg-red-600 text-white px-2 py-1 mt-2 w-fit"
                        >
                          Remove Document
                        </button>
                          {/* add document  */}
                        
                      </div>
                    );
                  })}
                  {/* ✅ PROGRESS BAR */}
                 {uploadProgress > 0 && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 h-3 rounded">
                        <div
                          className="bg-green-600 h-3 rounded"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-sm mt-1">{uploadProgress}% uploading...</p>
                    </div>
                  )}

                <div className="mt-4 flex gap-2">
                    <button type="button" onClick={addDocument} className="bg-gray-500 text-white px-2 py-1 mt-2">  + Add Document</button>
                  <button onClick={updateMatatu} className="bg-green-600 text-white px-3 py-1">Save</button>
                  <button onClick={() => setEditMode(false)} className="bg-gray-500 text-white px-3 py-1">Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

     
      TICKETS
      <h2 className="text-xl font-bold mt-6">Tickets</h2>
      {tickets.map((t, i) => (
        <div key={i} className="border p-2 mt-2">
          Matatu {t.matatu_id} → KES {t.amount}
        </div>
      ))}
    </div>
  );
}
