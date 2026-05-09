import os
import cloudinary
from dotenv import load_dotenv
load_dotenv() 
import cloudinary.uploader
import africastalking
import requests
import base64
import random
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from models import db, Matatu, Document, Ticket, Progress, Member, Payment, Route, Receipt, Assignment, DailyEarning, Expenditure, Saving, LoanRequest, LoanRepayment, SaccoPayment, LoanType, LoanApplication, LoanGuarantor, LoanRepaymentSchedule, LoanPayment, LoanAuditLog,LoanRepaymentAccount,RepaymentAccountTransaction,AuditLogPermanent,SalaryConfig,SalaryPayment,WorkerWarning
from config import Config
from flask_migrate import Migrate
from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)

app = Flask(__name__)
app.config.from_object(Config)
jwt = JWTManager(app)
app.config['JWT_SECRET_KEY'] = 'your-super-secret-key'
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(hours=5)

app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_HEADER_NAME"] = "Authorization"
app.config["JWT_HEADER_TYPE"] = "Bearer"


db.init_app(app)
CORS(
    app,
    supports_credentials=True,
    resources={r"/*": {"origins": "*"}},
    allow_headers=["Content-Type", "Authorization"]
)

migrate = Migrate(app, db)

# ---------------- CLOUDINARY ----------------
cloudinary.config(
    cloud_name="ddq0foaqz",
    api_key="318732943722333",
    api_secret="TNqkQAw2bh6HJc0vg8KnlyHNg9w"
)
# 👇 Add this temporarily to debug
print("CLOUDINARY CONFIG:", cloudinary.config().cloud_name, cloudinary.config().api_key)

# ---------------- AFRICAS TALKING ----------------
try:
    africastalking.initialize(
        username=os.getenv("AT_USERNAME", "sandbox"),
        api_key=os.getenv("AT_API_KEY", "atsk_test")
    )
    sms = africastalking.SMS
except Exception as e:
    print("AT init error:", e)
    sms = None


# ================= MPESA =================
def get_mpesa_token():
    url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    try:
        res = requests.get(url, auth=(os.getenv("MPESA_CONSUMER_KEY", ""), os.getenv("MPESA_CONSUMER_SECRET", "")))
        return res.json().get("access_token", "")
    except:
        return ""
 
@app.route("/mpesa/pay", methods=["POST"])
def mpesa_pay():
    data = request.json
    phone = str(data.get("phone", ""))
    amount = int(float(data.get("amount", 0)))
    if phone.startswith("0"):
        phone = "254" + phone[1:]
    try:
        token = get_mpesa_token()
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        shortcode = os.getenv("MPESA_SHORTCODE", "174379")
        passkey = os.getenv("MPESA_PASSKEY", "")
        password = base64.b64encode((shortcode + passkey + timestamp).encode()).decode()
        url = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "BusinessShortCode": shortcode, "Password": password,
            "Timestamp": timestamp, "TransactionType": "CustomerPayBillOnline",
            "Amount": amount, "PartyA": phone, "PartyB": shortcode,
            "PhoneNumber": phone,
            "CallBackURL": os.getenv("MPESA_CALLBACK_URL", "https://your-domain.com/mpesa/callback"),
            "AccountReference": "SACCO", "TransactionDesc": "SACCO Payment"
        }
        res = requests.post(url, json=payload, headers=headers)
        return jsonify(res.json())
    except Exception as e:
        return jsonify({"error": str(e), "ResponseCode": "1"}), 500
 
@app.route("/mpesa/callback", methods=["POST"])
def mpesa_callback():
    data = request.json
    try:
        result = data["Body"]["stkCallback"]
        if result["ResultCode"] == 0:
            metadata = result["CallbackMetadata"]["Item"]
            amount = next(i["Value"] for i in metadata if i["Name"] == "Amount")
            phone = next(i["Value"] for i in metadata if i["Name"] == "PhoneNumber")
            print(f"M-Pesa Payment received: KES {amount} from {phone}")
    except Exception as e:
        print("Callback error:", e)
    return jsonify({"ResultCode": 0})

# ================= INIT =================
with app.app_context():
    upload_folder = app.config.get("UPLOAD_FOLDER", "uploads")
    os.makedirs(upload_folder, exist_ok=True)
 

# ================= FILES =================
@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(app.config.get("UPLOAD_FOLDER", "uploads"), filename)


# ================= MATATUS =================
@app.route("/matatus", methods=["GET"])
def get_matatus():
    matatus = Matatu.query.all()

    return jsonify([
        {
            "id": m.id,
            "plate": m.plate,
            "owner_member_no": m.owner_member_no,
            "driver_name": m.driver_name,
            "driver_id": m.driver_id,
            "conductor_id": m.conductor_id,
            "route_id": m.route_id,
            "documents": [
                {
                    "id": d.id,
                    "number": d.number,
                    "type": d.type,
                    "issue": d.issue,
                    "expiry": d.expiry,
                    "file": d.file
                } for d in m.documents
            ],
            "progress": [
                {
                    "id": p.id,
                    "date": p.date,
                    "earnings": p.earnings,
                    "expenses": p.expenses,
                    "savings": p.savings
                } for p in m.progress
            ]
        } for m in matatus
    ])


@app.route("/matatus", methods=["POST"])
@jwt_required()
def create_matatu():
    owner_member_no = request.form.get("owner_member_no")
    print("OWNER MEMBER NO RECEIVED:", owner_member_no)
    owner = Member.query.filter_by(
        membership_no=owner_member_no,
        role="owner",
        is_active=True
    ).first()
    print("OWNER FOUND:", owner)
    if not owner:
        return jsonify({"error": "Invalid owner selected"}), 400
    
    # 👇 Check duplicate plate BEFORE inserting
    existing = Matatu.query.filter_by(plate=request.form.get("plate")).first()
    if existing:
        return jsonify({"error": "A matatu with this plate already exists"}), 400

    matatu = Matatu(
        plate=request.form.get("plate"),
        owner_member_no=request.form.get("owner_member_no"),
        driver_name=request.form.get("driver_name"),
        driver_id=request.form.get("driver_id"),
        conductor_id=request.form.get("conductor_id")
    )

    db.session.add(matatu)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Plate number already exists"}), 400

    i = 0
    while True:
        doc_type = request.form.get(f"documents[{i}][type]")
        if not doc_type:
            break

        file = request.files.get(f"documents[{i}][file]")
        file_url = None

        if file:
        # ✅ After - handles both images and raw files (PDF, docx, etc)
           file_type = file.content_type or ""
           if "image" in file_type:
              upload = cloudinary.uploader.upload(file)
           else:
              upload = cloudinary.uploader.upload(file, resource_type="raw")
           file_url = upload["secure_url"]

        doc = Document(
            number=request.form.get(f"documents[{i}][number]"),
            type=doc_type,
            issue=request.form.get(f"documents[{i}][issue]"),
            expiry=request.form.get(f"documents[{i}][expiry]"),
            file=file_url,
            matatu_id=matatu.id
        )

        db.session.add(doc)
        i += 1

    db.session.commit()

    return jsonify({"message": "Created", "id": matatu.id})


@app.route("/matatus/<int:id>", methods=["PUT"])
@jwt_required()
def update_matatu(id):
    matatu = Matatu.query.get_or_404(id)

    matatu.plate = request.form.get("plate")
    matatu.owner_member_no = request.form.get("owner_member_no")
    matatu.driver_name = request.form.get("driver_name")
    matatu.driver_id = request.form.get("driver_id")
    matatu.conductor_id = request.form.get("conductor_id")

    Document.query.filter_by(matatu_id=id).delete()

    i = 0
    while True:
        doc_type = request.form.get(f"documents[{i}][type]")
        if not doc_type:
            break

        file = request.files.get(f"documents[{i}][file]")
        file_url = request.form.get(f"documents[{i}][existing_file]")  # existing cloudinary URL

        if file:
               
                # ✅ After - handles both images and raw files (PDF, docx, etc)
                file_type = file.content_type or ""

                if "image" in file_type:
                    upload = cloudinary.uploader.upload(file)
                else:
                    upload = cloudinary.uploader.upload(file, resource_type="raw")

                file_url = upload["secure_url"]

        doc = Document(
            number=request.form.get(f"documents[{i}][number]"),
            type=doc_type,
            issue=request.form.get(f"documents[{i}][issue]"),
            expiry=request.form.get(f"documents[{i}][expiry]"),
            file=file_url,
            matatu_id=id
        )

        db.session.add(doc)
        i += 1

    db.session.commit()

    return jsonify({"message": "Updated"})


@app.route("/matatus/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_matatu(id):
    matatu = Matatu.query.get_or_404(id)
    db.session.delete(matatu)
    db.session.commit()
    return jsonify({"message": "Deleted"})


# ================= TICKETS =================
@app.route("/tickets", methods=["POST"])
def create_ticket():
    data = request.json

    ticket = Ticket(
        matatu_id=data["matatu_id"],
        amount=data["amount"],
        from_shimo=data["from_shimo"]
    )

    db.session.add(ticket)
    db.session.commit()

    return jsonify({
        "matatu_id": ticket.matatu_id,
        "amount": ticket.amount
    })


# ================= PROGRESS =================
@app.route("/progress", methods=["POST"])
def add_progress():
    data = request.json

    progress = Progress(
        matatu_id=data["matatu_id"],
        date=data["date"],
        earnings=float(data["earnings"]),
        expenses=float(data["expenses"]),
        savings=float(data["savings"])
    )

    db.session.add(progress)
    db.session.commit()

    return jsonify({
        "id": progress.id,
        "date": progress.date,
        "earnings": progress.earnings,
        "expenses": progress.expenses,
        "savings": progress.savings
    })


@app.route("/progress/<int:id>", methods=["DELETE"])
def delete_progress(id):
    p = Progress.query.get_or_404(id)
    db.session.delete(p)
    db.session.commit()
    return jsonify({"message": "deleted"})


# ================= SUMMARY =================
@app.route("/matatu-summary/<int:id>")
def matatu_summary(id):
    progress = Progress.query.filter_by(matatu_id=id).all()

    return jsonify({
        "earnings": sum(p.earnings for p in progress),
        "expenses": sum(p.expenses for p in progress),
        "savings": sum(p.savings for p in progress)
    })


# ================= SMS EXPIRY =================
@app.route("/check-expiry")
def check_expiry():
    today = datetime.now()
    soon = today + timedelta(days=7)

    docs = Document.query.all()

    for doc in docs:
        if not doc.expiry:
            continue

        expiry_date = datetime.strptime(doc.expiry, "%Y-%m-%d")

        if today < expiry_date < soon:
            matatu = Matatu.query.get(doc.matatu_id)

            member = Member.query.filter_by(
                membership_no=matatu.owner_member_no
            ).first()

            if member and member.phone:
                try:
                    sms.send(
                        f"⚠️ {doc.type} for {matatu.plate} expires on {doc.expiry}",
                        [member.phone]
                    )
                except Exception as e:
                    print("SMS ERROR:", e)

    return jsonify({"message": "Expiry check complete"})

# ================= MEMBERS =================
@app.route("/members/<int:id>")
def get_member(id):
    member = Member.query.get_or_404(id)

    return jsonify({
        "id": member.id,
        "name": member.name,
        "role": member.role,
        "phone": member.phone,
        "membership_no": member.membership_no
    })

# Get members
@app.route("/hr/members")
def get_members():
    members = Member.query.filter_by(is_active=True).all()
    print("ACTIVE MEMBERS:", [m.membership_no for m in members])

    return jsonify([
        {
            "id": m.id,
            "name": m.name,
            "membership_no": m.membership_no,
            "phone": m.phone,
            "role": m.role,
            "is_active": m.is_active
        } for m in members
    ])


# sign up
@app.route("/signup", methods=["POST"])
def signup():
    data = request.get_json()

    membership_no = data["membership_no"].strip().upper()

    allowed_roles = [
        "owner",
        "driver",
        "conductor",
        "stage_operator",
        "hr",
        "director",
        "member"
    ]

    # Validate role selected
    if not data.get("role"):
        return jsonify({"error": "Role is required"}), 400

    if data["role"] not in allowed_roles:
        return jsonify({"error": "Invalid role selected"}), 400

    # Check duplicate membership number
    existing_member = Member.query.filter_by(
        membership_no=membership_no
    ).first()

    if existing_member:
        return jsonify({"error": "Membership number already exists"}), 400

    # Check duplicate national ID
    existing_id = Member.query.filter_by(
        national_id=data["national_id"]
    ).first()

    if existing_id:
        return jsonify({"error": "National ID already registered"}), 400

    member = Member(
        membership_no=membership_no,
        name=data["name"],
        national_id=data["national_id"],
        phone=data["phone"],
        role=data["role"],
        is_active=False
    )

    member.set_password(data["password"])

    db.session.add(member)
    db.session.commit()

    return jsonify({
        "message": "Signup successful. Await HR approval."
    }), 201


# ================= AUTH =================
@app.route("/activate", methods=["POST"])
def activate_account():
    data = request.get_json()

    member = Member.query.filter_by(
        membership_no=data["membership_no"],
        national_id=data["national_id"]
    ).first()

    if not member:
        return jsonify({"error": "Member not found"}), 404

    if member.is_active:
        return jsonify({"error": "Account already activated"}), 400

    member.set_password(data["password"])
    member.is_active = True

    db.session.commit()

    return jsonify({"message": "Account activated successfully"})

# Login
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    print("LOGIN DATA:", data)

    member = Member.query.filter_by(
        membership_no=data["membership_no"]
    ).first()

    print("FOUND MEMBER:", member)

    if not member:
        return jsonify({"error": "Member not found"}), 404

    print("ACTIVE:", member.is_active)

    if not member.is_active:
        return jsonify({"error": "Await HR approval"}), 403

    print("PASSWORD CHECK:", member.check_password(data["password"]))

    if not member.check_password(data["password"]):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity={
        "id": member.id,
        "role": member.role,
        "name": member.name,
        "membership_no": member.membership_no
    })

    return jsonify({
        "token": token,
        "member": {
            "id": member.id,
            "name": member.name,
            "role": member.role,
            "membership_no": member.membership_no
        }
    })
# HR CREATE MEMBER (NO APPROVAL NEEDED)
@app.route("/hr/create-member", methods=["POST"])
def hr_create_member():
    data = request.get_json()
    print("NEW MEMBER DATA:", data)
    membership_no = data.get("membership_no", "").strip().upper()
    if not membership_no:
      return jsonify({"error": "Membership number is required"}), 400

    allowed_roles = [
        "owner", "driver", "conductor",
        "stage_operator", "hr", "director", "member"
    ]
    if not membership_no:
       return jsonify({"error": "Membership number required"}), 400
    if data["role"] not in allowed_roles:
        return jsonify({"error": "Invalid role"}), 400

    # check duplicates
    if Member.query.filter_by(membership_no=membership_no).first():
        return jsonify({"error": "Membership number already exists"}), 400

    if Member.query.filter_by(national_id=data["national_id"]).first():
        return jsonify({"error": "National ID already registered"}), 400

    member = Member(
        membership_no=membership_no,
        name=data["name"],
        national_id=data["national_id"],
        phone=data["phone"],
        role=data["role"],
        is_active=True   # ✅ KEY DIFFERENCE
    )

    member.set_password(data["password"])

    db.session.add(member)
    print("SAVED MEMBER:", member.membership_no, member.is_active)
    db.session.commit()

    return jsonify({"message": "Member created and activated"}), 201
# pending members (hr side)
@app.route("/hr/pending-members")
def pending_members():
    members = Member.query.filter_by(is_active=False).all()

    return jsonify([
        {
            "id": m.id,
            "membership_no": m.membership_no,
            "name": m.name,
            "role": m.role,
            "phone": m.phone
        } for m in members
    ])
# ACTIVE MEMBERS (HR SIDE)
@app.route("/hr/member/<int:id>")
def get_member_details(id):
    m = Member.query.get_or_404(id)

    return jsonify({
        "id": m.id,
        "membership_no": m.membership_no,
        "name": m.name,
        "national_id": m.national_id,
        "phone": m.phone,
        "role": m.role,
        "is_active": m.is_active
    })
# UPDATE MEMBER (NO ROLE CHANGE, NO DELETE)
@app.route("/hr/member/update/<int:id>", methods=["PUT"])
def update_member(id):
    m = Member.query.get_or_404(id)
    data = request.get_json()

    allowed_roles = [
        "owner",
        "driver",
        "conductor",
        "stage_operator",
        "hr",
        "director",
        "member"
    ]

    if "role" in data and data["role"] not in allowed_roles:
        return jsonify({"error": "Invalid role"}), 400

    m.name = data.get("name", m.name)
    m.membership_no = data.get("membership_no", m.membership_no)
    m.phone = data.get("phone", m.phone)
    m.national_id = data.get("national_id", m.national_id)
    m.role = data.get("role", m.role)

    db.session.commit()

    return jsonify({"message": "Member updated"})

# update role update
@app.route("/hr/update-role/<int:id>", methods=["PUT"])
def update_role(id):
    m = Member.query.get_or_404(id)
    data = request.get_json()

    allowed_roles = [
        "owner",
        "driver",
        "conductor",
        "stage_operator",
        "hr",
        "director",
        "member"
    ]

    if data["role"] not in allowed_roles:
        return jsonify({"error": "Invalid role"}), 400

    m.role = data["role"]
    db.session.commit()

    return jsonify({"message": "Role updated"})

# APPROVE MEMBER
@app.route("/hr/approve/<int:id>", methods=["PUT"])
def approve_member(id):
    m = Member.query.get_or_404(id)

    m.is_active = True
    db.session.commit()

    return jsonify({"message": "Member approved"})

# REJECT MEMBER
@app.route("/hr/reject/<int:id>", methods=["DELETE"])
def reject_member(id):
    m = Member.query.get_or_404(id)

    m.is_active = False   # ✅ instead of delete
    db.session.commit()

    return jsonify({"message": "Member rejected (deactivated)"})
# ================= AUDIT LOG =================
audit_logs = []  # module level

@app.route("/hr/audit-log", methods=["GET"])
def get_logs():
    return jsonify(audit_logs)

@app.route("/hr/audit-log", methods=["POST"])
def add_log():
    data = request.get_json()
    audit_logs.append({
        "action": data.get("action"),
        "member_id": data.get("member_id"),
        "membership_no": data.get("membership_no"),
        "hr_name": data.get("hr_name"),
        "timestamp": data.get("timestamp")
    })
    return jsonify({"message": "logged"})
@app.route("/audit/permanent", methods=["POST"])
@jwt_required()
def create_permanent_audit():
    identity = get_jwt_identity()
    data = request.get_json()
    log = AuditLogPermanent(
        action=data.get("action"),
        category=data.get("category", "general"),
        member_id=data.get("member_id"),
        membership_no=data.get("membership_no"),
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=data.get("details", "")
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Logged", "id": log.id}), 201

@app.route("/audit/permanent", methods=["GET"])
@jwt_required()
def get_permanent_audit():
    category = request.args.get("category")
    limit = int(request.args.get("limit", 500))
    query = AuditLogPermanent.query
    if category:
        query = query.filter_by(category=category)
    logs = query.order_by(AuditLogPermanent.created_at.desc()).limit(limit).all()
    return jsonify([{
        "id": l.id,
        "action": l.action,
        "category": l.category,
        "membership_no": l.membership_no,
        "performed_by_name": l.performed_by_name,
        "performed_by_role": l.performed_by_role,
        "details": l.details,
        "created_at": l.created_at.isoformat()
    } for l in logs])



# # ================= OWNERS =================
@app.route("/owners", methods=["GET"])
def get_owners():
    owners = Member.query.filter_by(role="owner", is_active=True).all()

    return jsonify([
        {
            "id": owner.id,
            "name": owner.name,
           "membership_no": owner.membership_no,
            "phone": owner.phone
        }
        for owner in owners
    ])

# ================= ROUTES =================
@app.route("/routes", methods=["GET"])
def get_routes():
    routes = Route.query.filter_by(is_active=True).all()
    return jsonify([
        {
            "id": r.id,
            "from_stage": r.from_stage,
            "to_stage": r.to_stage,
            "shimo_fee": r.shimo_fee,
            "is_active": r.is_active
        } for r in routes
    ])

@app.route("/routes", methods=["POST"])
@jwt_required()
def create_route():
    data = request.get_json()
    if not data or not data.get("from_stage") or not data.get("to_stage") or not data.get("shimo_fee"):
        return jsonify({"error": "All fields required: from_stage, to_stage, shimo_fee"}), 400
    existing = Route.query.filter_by(
        from_stage=data["from_stage"].strip(), to_stage=data["to_stage"].strip()
    ).first()
    if existing and existing.is_active:
        return jsonify({"error": "Route already exists"}), 400
    if existing and not existing.is_active:
        existing.is_active = True
        existing.shimo_fee = float(data["shimo_fee"])
        db.session.commit()
        return jsonify({"message": "Route reactivated", "id": existing.id}), 201
    route = Route(
        from_stage=data["from_stage"].strip(),
        to_stage=data["to_stage"].strip(),
        shimo_fee=float(data["shimo_fee"])
    )
    db.session.add(route)
    db.session.commit()
    return jsonify({"message": "Route created", "id": route.id,
                    "from_stage": route.from_stage, "to_stage": route.to_stage,
                    "shimo_fee": route.shimo_fee}), 201

@app.route("/routes/<int:id>", methods=["PUT"])
@jwt_required()
def update_route(id):
    route = Route.query.get_or_404(id)
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    if data.get("from_stage"):
        route.from_stage = data["from_stage"].strip()
    if data.get("to_stage"):
        route.to_stage = data["to_stage"].strip()
    if data.get("shimo_fee") is not None:
        route.shimo_fee = float(data["shimo_fee"])
    db.session.commit()
    return jsonify({"message": "Route updated", "id": route.id,
                    "from_stage": route.from_stage, "to_stage": route.to_stage,
                    "shimo_fee": route.shimo_fee})
 
@app.route("/routes/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_route(id):
    route = Route.query.get_or_404(id)
    route.is_active = False
    db.session.commit()
    return jsonify({"message": "Route deactivated"})

@app.route("/me")
@jwt_required()
def get_me():
    return jsonify(get_jwt_identity())

# ================= RECEIPTS =================
def generate_ticket_number():
    date_str = datetime.now().strftime("%Y%m%d")
    random_num = random.randint(1000, 9999)
    return f"TKT-{date_str}-{random_num}"
 
@app.route("/receipts", methods=["POST"])
@jwt_required()
def create_receipt():
    data = request.get_json()
    ticket_number = generate_ticket_number()
    receipt = Receipt(
        ticket_number=ticket_number,
        sacco_name=data.get("sacco_name", "Matatu SACCO"),
        matatu_id=int(data["matatu_id"]),
        plate=data["plate"], owner_name=data.get("owner_name", ""),
        route_id=int(data["route_id"]),
        from_stage=data["from_stage"], to_stage=data["to_stage"],
        shimo_fee=float(data["shimo_fee"]),
        capacity=data.get("capacity", 0),
        mode_of_payment=data["mode_of_payment"],
        issued_by=int(data["issued_by"]),
        operator_membership_no=data.get("operator_membership_no", ""),
        date_issued=data["date_issued"],
        time_issued=datetime.now().strftime("%H:%M:%S"),
        is_submitted=False
    )
    db.session.add(receipt)
    db.session.commit()
    return jsonify({"message": "Draft created", "id": receipt.id, "ticket_number": ticket_number}), 201
 
@app.route("/receipts/<int:id>", methods=["PUT"])
@jwt_required()
def update_receipt(id):
    receipt = Receipt.query.get_or_404(id)
    if receipt.is_submitted:
        return jsonify({"error": "Submitted receipts cannot be edited"}), 403
    data = request.get_json()
    receipt.plate = data.get("plate", receipt.plate)
    receipt.owner_name = data.get("owner_name", receipt.owner_name)
    receipt.route_id = data.get("route_id", receipt.route_id)
    receipt.from_stage = data.get("from_stage", receipt.from_stage)
    receipt.to_stage = data.get("to_stage", receipt.to_stage)
    if data.get("shimo_fee") is not None:
        receipt.shimo_fee = float(data["shimo_fee"])
    receipt.capacity = data.get("capacity", receipt.capacity)
    receipt.mode_of_payment = data.get("mode_of_payment", receipt.mode_of_payment)
    receipt.date_issued = data.get("date_issued", receipt.date_issued)
    db.session.commit()
    return jsonify({"message": "Updated"})
 
@app.route("/receipts/<int:id>/submit", methods=["PUT"])
@jwt_required()
def submit_receipt(id):
    receipt = Receipt.query.get_or_404(id)
    if receipt.is_submitted:
        return jsonify({"error": "Already submitted"}), 400
    receipt.is_submitted = True
    db.session.commit()
    return jsonify({"message": "Receipt submitted and locked"})
 
@app.route("/receipts/my", methods=["GET"])
@jwt_required()
def get_my_receipts():
    identity = get_jwt_identity()
    date_filter = request.args.get("date")
    query = Receipt.query.filter_by(issued_by=identity["id"], is_submitted=True)
    if date_filter:
        query = query.filter_by(date_issued=date_filter)
    receipts = query.order_by(Receipt.created_at.desc()).all()
    return jsonify([{
        "id": r.id, "ticket_number": r.ticket_number, "plate": r.plate,
        "owner_name": r.owner_name, "from_stage": r.from_stage,
        "to_stage": r.to_stage, "shimo_fee": r.shimo_fee, "capacity": r.capacity,
        "mode_of_payment": r.mode_of_payment, "date_issued": r.date_issued,
        "time_issued": r.time_issued, "operator_membership_no": r.operator_membership_no,
        "sacco_name": r.sacco_name
    } for r in receipts])
 
@app.route("/receipts/owner-trips", methods=["GET"])
@jwt_required()
def get_owner_trips():
    identity = get_jwt_identity()
    date_filter = request.args.get("date")
    owner_matatus = Matatu.query.filter_by(owner_member_no=identity["membership_no"]).all()
    plates = [m.plate for m in owner_matatus]
    if not plates:
        return jsonify([])
    query = Receipt.query.filter(Receipt.plate.in_(plates), Receipt.is_submitted == True)
    if date_filter:
        query = query.filter_by(date_issued=date_filter)
    receipts = query.order_by(Receipt.created_at.desc()).all()
    return jsonify([{
        "id": r.id, "ticket_number": r.ticket_number, "plate": r.plate,
        "from_stage": r.from_stage, "to_stage": r.to_stage, "shimo_fee": r.shimo_fee,
        "mode_of_payment": r.mode_of_payment, "date_issued": r.date_issued,
        "time_issued": r.time_issued, "owner_name": r.owner_name,
        "operator_membership_no": r.operator_membership_no
    } for r in receipts])
 
@app.route("/receipts/all", methods=["GET"])
@jwt_required()
def get_all_receipts():
    date_filter = request.args.get("date")
    query = Receipt.query.filter_by(is_submitted=True)
    if date_filter:
        query = query.filter_by(date_issued=date_filter)
    receipts = query.order_by(Receipt.created_at.desc()).all()
    return jsonify([{
        "id": r.id, "ticket_number": r.ticket_number, "plate": r.plate,
        "from_stage": r.from_stage, "to_stage": r.to_stage, "shimo_fee": r.shimo_fee,
        "mode_of_payment": r.mode_of_payment, "date_issued": r.date_issued,
        "time_issued": r.time_issued, "operator_membership_no": r.operator_membership_no
    } for r in receipts])


# ================= ASSIGNMENTS =================
@app.route("/assignments", methods=["POST"])
@jwt_required()
def assign_matatu():
    data = request.get_json()
    identity = get_jwt_identity()

    # Check if already assigned
    existing = Assignment.query.filter_by(
        matatu_id=data["matatu_id"],
        role=data["role"],
        is_active=True
    ).first()

    if existing:
        # Deactivate old assignment first
        existing.is_active = False
        db.session.commit()

    assignment = Assignment(
        matatu_id=data["matatu_id"],
        member_id=data["member_id"],
        role=data["role"],  # "driver" or "conductor"
        assigned_by=identity["id"]
    )

    db.session.add(assignment)
    db.session.commit()

    return jsonify({"message": "Assigned successfully", "id": assignment.id}), 201


@app.route("/assignments/matatu/<int:matatu_id>", methods=["GET"])
@jwt_required()
def get_matatu_assignments(matatu_id):
    assignments = Assignment.query.filter_by(
        matatu_id=matatu_id,
        is_active=True
    ).all()

    result = []
    for a in assignments:
        member = Member.query.get(a.member_id)
        result.append({
            "id": a.id,
            "matatu_id": a.matatu_id,
            "member_id": a.member_id,
            "member_name": member.name if member else "Unknown",
            "membership_no": member.membership_no if member else "",
            "role": a.role,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat()
        })

    return jsonify(result)


@app.route("/assignments/my", methods=["GET"])
@jwt_required()
def get_my_assignment():
    identity = get_jwt_identity()
    assignment = Assignment.query.filter_by(
        member_id=identity["id"],
        is_active=True
    ).first()

    if not assignment:
        return jsonify({"error": "No active assignment"}), 404

    matatu = Matatu.query.get(assignment.matatu_id)
    owner = Member.query.filter_by(
        membership_no=matatu.owner_member_no
    ).first()

    return jsonify({
        "id": assignment.id,
        "matatu_id": matatu.id,
        "plate": matatu.plate,
        "owner_name": owner.name if owner else "Unknown",
        "owner_id": owner.id if owner else None,
        "owner_membership_no": matatu.owner_member_no,
        "role": assignment.role
    })


@app.route("/assignments/<int:id>/deactivate", methods=["PUT"])
@jwt_required()
def deactivate_assignment(id):
    assignment = Assignment.query.get_or_404(id)
    assignment.is_active = False
    db.session.commit()
    return jsonify({"message": "Assignment removed"})


# ================= DAILY EARNINGS =================
@app.route("/earnings", methods=["POST"])
@jwt_required()
def submit_earning():
    identity = get_jwt_identity()

    proof_file = None
    if "proof_file" in request.files:
        file = request.files["proof_file"]
        file_type = file.content_type or ""
        if "image" in file_type:
            upload = cloudinary.uploader.upload(file)
        else:
            upload = cloudinary.uploader.upload(file, resource_type="raw")
        proof_file = upload["secure_url"]

    earning = DailyEarning(
        matatu_id=request.form.get("matatu_id"),
        submitted_by=identity["id"],
        owner_id=request.form.get("owner_id"),
        amount=float(request.form.get("amount")),
        date=request.form.get("date"),
        proof_file=proof_file,
        notes=request.form.get("notes", "")
    )

    db.session.add(earning)
    db.session.commit()

    return jsonify({"message": "Earning submitted", "id": earning.id}), 201


@app.route("/earnings/matatu/<int:matatu_id>", methods=["GET"])
@jwt_required()
def get_matatu_earnings(matatu_id):
    date_filter = request.args.get("date")
    query = DailyEarning.query.filter_by(matatu_id=matatu_id)

    if date_filter:
        query = query.filter_by(date=date_filter)

    earnings = query.order_by(DailyEarning.created_at.desc()).all()

    return jsonify([{
        "id": e.id,
        "amount": e.amount,
        "date": e.date,
        "proof_file": e.proof_file,
        "notes": e.notes,
        "is_confirmed": e.is_confirmed,
        "submitted_by": e.submitted_by
    } for e in earnings])


@app.route("/earnings/owner", methods=["GET"])
@jwt_required()
def get_owner_earnings():
    identity = get_jwt_identity()
    date_filter = request.args.get("date")

    query = DailyEarning.query.filter_by(owner_id=identity["id"])
    if date_filter:
        query = query.filter_by(date=date_filter)

    earnings = query.order_by(DailyEarning.created_at.desc()).all()

    return jsonify([{
        "id": e.id,
        "matatu_id": e.matatu_id,
        "amount": e.amount,
        "date": e.date,
        "proof_file": e.proof_file,
        "notes": e.notes,
        "is_confirmed": e.is_confirmed,
        "submitted_by": e.submitted_by
    } for e in earnings])


@app.route("/earnings/<int:id>/confirm", methods=["PUT"])
@jwt_required()
def confirm_earning(id):
    earning = DailyEarning.query.get_or_404(id)
    earning.is_confirmed = True
    db.session.commit()
    return jsonify({"message": "Earning confirmed"})


# ================= EXPENDITURES =================
@app.route("/expenditures", methods=["POST"])
@jwt_required()
def submit_expenditure():
    identity = get_jwt_identity()

    proof_file = None
    if "proof_file" in request.files:
        file = request.files["proof_file"]
        file_type = file.content_type or ""
        if "image" in file_type:
            upload = cloudinary.uploader.upload(file)
        else:
            upload = cloudinary.uploader.upload(file, resource_type="raw")
        proof_file = upload["secure_url"]

    expenditure = Expenditure(
        matatu_id=request.form.get("matatu_id"),
        submitted_by=identity["id"],
        amount=float(request.form.get("amount")),
        description=request.form.get("description"),
        proof_file=proof_file,
        date=request.form.get("date")
    )

    db.session.add(expenditure)
    db.session.commit()

    return jsonify({"message": "Expenditure recorded", "id": expenditure.id}), 201


@app.route("/expenditures/matatu/<int:matatu_id>", methods=["GET"])
@jwt_required()
def get_matatu_expenditures(matatu_id):
    expenditures = Expenditure.query.filter_by(
        matatu_id=matatu_id
    ).order_by(Expenditure.created_at.desc()).all()

    return jsonify([{
        "id": e.id,
        "amount": e.amount,
        "description": e.description,
        "proof_file": e.proof_file,
        "date": e.date,
        "submitted_by": e.submitted_by
    } for e in expenditures])


# ================= SAVINGS =================
@app.route("/savings/deposit", methods=["POST"])
@jwt_required()
def deposit_saving():
    identity = get_jwt_identity()
    data = request.get_json()

    raw_matatu = data.get("matatu_id")
    matatu_id = int(raw_matatu) if raw_matatu and str(raw_matatu).strip() else None
    saving = Saving(
        member_id=identity["id"],
        matatu_id=matatu_id,
        amount=data["amount"],
        transaction_type="deposit",
        description=data.get("description", "Deposit"),
        date=data["date"]
    )

    db.session.add(saving)
    db.session.commit()

    return jsonify({"message": "Deposit recorded", "id": saving.id}), 201


@app.route("/savings/my", methods=["GET"])
@jwt_required()
def get_my_savings():
    identity = get_jwt_identity()
    savings = Saving.query.filter_by(
        member_id=identity["id"]
    ).order_by(Saving.created_at.desc()).all()

    total = sum(
        s.amount if s.transaction_type == "deposit" else -s.amount
        for s in savings
    )

    return jsonify({
        "balance": total,
        "transactions": [{
            "id": s.id,
            "amount": s.amount,
            "transaction_type": s.transaction_type,
            "description": s.description,
            "date": s.date,
            "matatu_id": s.matatu_id
        } for s in savings]
    })


@app.route("/savings/matatu/<int:matatu_id>", methods=["GET"])
@jwt_required()
def get_matatu_savings(matatu_id):
    savings = Saving.query.filter_by(matatu_id=matatu_id).all()
    total = sum(
        s.amount if s.transaction_type == "deposit" else -s.amount
        for s in savings
    )
    return jsonify({
        "balance": total,
        "transactions": [{
            "id": s.id,
            "amount": s.amount,
            "transaction_type": s.transaction_type,
            "description": s.description,
            "date": s.date
        } for s in savings]
    })


# ================= LOANS =================
@app.route("/loans/request", methods=["POST"])
@jwt_required()
def request_loan():
    identity = get_jwt_identity()
    data = request.get_json()

    # Check no active loan
    active_loan = LoanRequest.query.filter(
        LoanRequest.member_id == identity["id"],
        LoanRequest.status.in_(["pending", "approved", "repaying"])
    ).first()

    if active_loan:
        return jsonify({"error": "You already have an active loan"}), 400

    loan = LoanRequest(
        member_id=identity["id"],
        amount=data["amount"],
        reason=data["reason"],
        monthly_installment=data.get("monthly_installment")
    )

    db.session.add(loan)
    db.session.commit()

    return jsonify({"message": "Loan request submitted", "id": loan.id}), 201


@app.route("/loans/my", methods=["GET"])
@jwt_required()
def get_my_loans():
    identity = get_jwt_identity()
    loans = LoanRequest.query.filter_by(
        member_id=identity["id"]
    ).order_by(LoanRequest.created_at.desc()).all()

    return jsonify([{
        "id": l.id,
        "amount": l.amount,
        "reason": l.reason,
        "status": l.status,
        "amount_repaid": l.amount_repaid,
        "balance": l.amount - l.amount_repaid,
        "monthly_installment": l.monthly_installment,
        "created_at": l.created_at.isoformat()
    } for l in loans])


@app.route("/loans/all", methods=["GET"])
@jwt_required()
def get_all_loans():
    loans = LoanRequest.query.order_by(
        LoanRequest.created_at.desc()
    ).all()

    result = []
    for l in loans:
        member = Member.query.get(l.member_id)
        result.append({
            "id": l.id,
            "member_name": member.name if member else "Unknown",
            "membership_no": member.membership_no if member else "",
            "amount": l.amount,
            "reason": l.reason,
            "status": l.status,
            "amount_repaid": l.amount_repaid,
            "balance": l.amount - l.amount_repaid,
            "monthly_installment": l.monthly_installment,
            "created_at": l.created_at.isoformat()
        })

    return jsonify(result)


@app.route("/loans/<int:id>/approve", methods=["PUT"])
@jwt_required()
def approve_loan(id):
    identity = get_jwt_identity()
    loan = LoanRequest.query.get_or_404(id)

    if loan.status != "pending":
        return jsonify({"error": "Only pending loans can be approved"}), 400

    loan.status = "approved"
    loan.approved_by = identity["id"]
    loan.approved_at = datetime.utcnow()

    db.session.commit()

    return jsonify({"message": "Loan approved"})


@app.route("/loans/<int:id>/reject", methods=["PUT"])
@jwt_required()
def reject_loan(id):
    loan = LoanRequest.query.get_or_404(id)

    if loan.status != "pending":
        return jsonify({"error": "Only pending loans can be rejected"}), 400

    loan.status = "rejected"
    db.session.commit()

    return jsonify({"message": "Loan rejected"})


@app.route("/loans/repay", methods=["POST"])
@jwt_required()
def repay_loan():
    identity = get_jwt_identity()
    data = request.get_json()

    loan = LoanRequest.query.get_or_404(data["loan_id"])

    if loan.status not in ["approved", "repaying"]:
        return jsonify({"error": "Loan is not active"}), 400

    repayment = LoanRepayment(
        loan_id=loan.id,
        member_id=identity["id"],
        amount=data["amount"],
        date=data["date"],
        proof_file=data.get("proof_file")
    )

    db.session.add(repayment)

    loan.amount_repaid += data["amount"]
    loan.status = "repaying"

    if loan.amount_repaid >= loan.amount:
        loan.status = "cleared"

    db.session.commit()

    return jsonify({
        "message": "Repayment recorded",
        "balance": loan.amount - loan.amount_repaid,
        "status": loan.status
    })


@app.route("/loans/<int:id>/repayments", methods=["GET"])
@jwt_required()
def get_loan_repayments(id):
    repayments = LoanRepayment.query.filter_by(
        loan_id=id
    ).order_by(LoanRepayment.created_at.desc()).all()

    return jsonify([{
        "id": r.id,
        "amount": r.amount,
        "date": r.date,
        "proof_file": r.proof_file
    } for r in repayments])
# ================= SACCO PAYMENTS =================

@app.route("/sacco-payments", methods=["POST"])
@jwt_required()
def create_sacco_payment():
    identity = get_jwt_identity()
    proof_file = None
    if "proof_file" in request.files:
        file = request.files["proof_file"]
        file_type = file.content_type or ""
        upload = cloudinary.uploader.upload(file, resource_type="raw" if "image" not in file_type else "image")
        proof_file = upload["secure_url"]
    raw_matatu = request.form.get("matatu_id")
    matatu_id = int(raw_matatu) if raw_matatu and str(raw_matatu).strip() else None
    payment = SaccoPayment(
        member_id=identity["id"],
        matatu_id=matatu_id,
        payment_type=request.form.get("payment_type"),
        amount=float(request.form.get("amount")),
        proof_file=proof_file,
        date=request.form.get("date"),
        notes=request.form.get("notes", "")
    )
    db.session.add(payment)
    db.session.commit()
    return jsonify({"message": "Payment recorded", "id": payment.id}), 201

@app.route("/sacco-payments/my", methods=["GET"])
@jwt_required()
def get_my_sacco_payments():
    identity = get_jwt_identity()
    payments = SaccoPayment.query.filter_by(member_id=identity["id"]).order_by(SaccoPayment.created_at.desc()).all()
    return jsonify([{
        "id": p.id, "payment_type": p.payment_type, "amount": p.amount,
        "matatu_id": p.matatu_id, "proof_file": p.proof_file,
        "date": p.date, "notes": p.notes
    } for p in payments])
@app.route("/sacco-payments/all", methods=["GET"])
@jwt_required()
def get_all_sacco_payments():
    payments = SaccoPayment.query.order_by(SaccoPayment.created_at.desc()).all()
    result = []
    for p in payments:
        member = Member.query.get(p.member_id)
        result.append({
            "id": p.id, "payment_type": p.payment_type, "amount": p.amount,
            "matatu_id": p.matatu_id, "proof_file": p.proof_file, "date": p.date,
            "notes": p.notes, "member_name": member.name if member else "",
            "membership_no": member.membership_no if member else ""
        })
    return jsonify(result)

    # owner documnt 
@app.route("/documents", methods=["POST"])
def add_document():
    file = request.files.get("file")
    file_url = None
    if file:
        file_type = file.content_type or ""
        upload = cloudinary.uploader.upload(file, resource_type="raw" if "image" not in file_type else "image")
        file_url = upload["secure_url"]
    doc = Document(
        matatu_id=request.form.get("matatu_id"),
        number=request.form.get("number"),
        type=request.form.get("type"),
        issue=request.form.get("issue"),
        expiry=request.form.get("expiry"),
        file=file_url
    )
    db.session.add(doc)
    db.session.commit()
    return jsonify({"message": "Document added"}), 201

# ================= LOAN TYPES (HR manages) =================
@app.route("/loan-types", methods=["GET"])
def get_loan_types():
    types = LoanType.query.filter_by(is_active=True).all()
    return jsonify([{
        "id": t.id, "name": t.name, "interest_rate": t.interest_rate,
        "max_amount": t.max_amount, "min_amount": t.min_amount,
        "max_months": t.max_months, "min_months": t.min_months,
        "description": t.description
    } for t in types])

@app.route("/loan-types", methods=["POST"])
@jwt_required()
def create_loan_type():
    data = request.get_json()
    lt = LoanType(
        name=data["name"], interest_rate=data["interest_rate"],
        max_amount=data["max_amount"], min_amount=data["min_amount"],
        max_months=data["max_months"], min_months=data["min_months"],
        description=data.get("description", "")
    )
    db.session.add(lt)
    db.session.commit()
    return jsonify({"message": "Loan type created", "id": lt.id}), 201

@app.route("/loan-types/<int:id>", methods=["PUT"])
@jwt_required()
def update_loan_type(id):
    lt = LoanType.query.get_or_404(id)
    data = request.get_json()
    for field in ["name", "interest_rate", "max_amount", "min_amount", "max_months", "min_months", "description", "is_active"]:
        if field in data:
            setattr(lt, field, data[field])
    db.session.commit()
    return jsonify({"message": "Updated"})

# ================= LOAN ELIGIBILITY =================
@app.route("/loans/eligibility", methods=["GET"])
@jwt_required()
def check_eligibility():
    identity = get_jwt_identity()
    member_id = identity["id"]
    active_loan = LoanApplication.query.filter(
        LoanApplication.member_id == member_id,
        LoanApplication.status.in_(["pending", "guarantors_pending", "approved", "disbursed", "repaying"])
    ).first()
    savings = Saving.query.filter_by(member_id=member_id).all()
    total_savings = sum(s.amount if s.transaction_type == "deposit" else -s.amount for s in savings)
    payments = SaccoPayment.query.filter_by(member_id=member_id).all()
    total_contributions = sum(p.amount for p in payments)
    # Combined score for eligibility
    combined = total_savings + total_contributions
    past_loans = LoanApplication.query.filter(
        LoanApplication.member_id == member_id,
        LoanApplication.status.in_(["cleared", "defaulted"])
    ).all()
    defaults = [l for l in past_loans if l.status == "defaulted"]
    eligible = True
    reasons = []
    if active_loan:
        eligible = False
        reasons.append("You have an active loan")
    if combined < 1000:
        eligible = False
        reasons.append(f"Insufficient contributions (need KES 1,000 — you have KES {combined:,.0f} total savings+contributions)")
    if len(defaults) > 0:
        eligible = False
        reasons.append(f"You have {len(defaults)} defaulted loan(s)")
    max_eligible = max(total_savings, total_contributions, combined) * 3
    return jsonify({
        "eligible": eligible, "reasons": reasons,
        "total_savings": total_savings, "total_contributions": total_contributions,
        "max_eligible_amount": max_eligible, "past_loans": len(past_loans),
        "defaults": len(defaults), "has_active_loan": active_loan is not None
    })
# ================= LOAN APPLICATIONS =================

@app.route("/loan-applications", methods=["POST"])
@jwt_required()
def apply_for_loan():
    identity = get_jwt_identity()
    supporting_doc = None
    if "supporting_doc" in request.files:
        file = request.files["supporting_doc"]
        file_type = file.content_type or ""
        upload = cloudinary.uploader.upload(file, resource_type="image" if "image" in file_type else "raw")
        supporting_doc = upload["secure_url"]
    loan_type = LoanType.query.get_or_404(request.form.get("loan_type_id"))
    amount = float(request.form.get("amount"))
    months = int(request.form.get("repayment_months"))
    interest = loan_type.interest_rate
    total_interest = (amount * interest / 100) * (months / 12)
    total_payable = amount + total_interest
    monthly_installment = total_payable / months
    raw_matatu = request.form.get("matatu_id")
    matatu_id = int(raw_matatu) if raw_matatu and str(raw_matatu).strip() else None
    loan = LoanApplication(
        member_id=identity["id"], loan_type_id=loan_type.id, matatu_id=matatu_id,
        amount=amount, interest_rate=interest, repayment_months=months,
        monthly_installment=round(monthly_installment, 2),
        total_payable=round(total_payable, 2),
        purpose=request.form.get("purpose"), supporting_doc=supporting_doc,
        status="guarantors_pending"
    )
    db.session.add(loan)
    db.session.commit()
    guarantor_ids = request.form.getlist("guarantor_ids")
    for gid in guarantor_ids:
        g = LoanGuarantor(loan_id=loan.id, guarantor_id=int(gid))
        db.session.add(g)
    log = LoanAuditLog(loan_id=loan.id, action="APPLICATION_SUBMITTED", performed_by=identity["id"])
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Loan application submitted", "id": loan.id, "status": loan.status}), 201
 
@app.route("/loan-applications/my", methods=["GET"])
@jwt_required()
def get_my_applications():
    identity = get_jwt_identity()
    loans = LoanApplication.query.filter_by(member_id=identity["id"]).order_by(LoanApplication.created_at.desc()).all()
    result = []
    for l in loans:
        loan_type = LoanType.query.get(l.loan_type_id)
        guarantors = LoanGuarantor.query.filter_by(loan_id=l.id).all()
        schedule = LoanRepaymentSchedule.query.filter_by(loan_id=l.id).all()
        result.append({
            "id": l.id, "amount": l.amount, "interest_rate": l.interest_rate,
            "repayment_months": l.repayment_months, "monthly_installment": l.monthly_installment,
            "total_payable": l.total_payable, "purpose": l.purpose,
            "status": l.status, "admin_notes": l.admin_notes,
            "amount_repaid": l.amount_repaid, "penalty": l.penalty,
            "balance": l.total_payable - l.amount_repaid,
            "loan_type": loan_type.name if loan_type else "",
            "matatu_id": l.matatu_id, "supporting_doc": l.supporting_doc,
            "created_at": l.created_at.isoformat(),
            "approved_at": l.approved_at.isoformat() if l.approved_at else None,
            "guarantors": [{"id": g.id, "guarantor_id": g.guarantor_id, "status": g.status} for g in guarantors],
            "schedule": [{"id": s.id, "installment_no": s.installment_no, "due_date": s.due_date,
                           "amount_due": s.amount_due, "amount_paid": s.amount_paid, "status": s.status}
                          for s in schedule]
        })
    return jsonify(result)
 
@app.route("/loan-applications/all", methods=["GET"])
@jwt_required()
def get_all_applications():
    loans = LoanApplication.query.order_by(LoanApplication.created_at.desc()).all()
    result = []
    for l in loans:
        member = Member.query.get(l.member_id)
        loan_type = LoanType.query.get(l.loan_type_id)
        guarantors = LoanGuarantor.query.filter_by(loan_id=l.id).all()
        savings = Saving.query.filter_by(member_id=l.member_id).all()
        total_savings = sum(s.amount if s.transaction_type == "deposit" else -s.amount for s in savings)
        contributions = SaccoPayment.query.filter_by(member_id=l.member_id).all()
        total_contributions = sum(p.amount for p in contributions)
        result.append({
            "id": l.id, "amount": l.amount, "interest_rate": l.interest_rate,
            "repayment_months": l.repayment_months, "monthly_installment": l.monthly_installment,
            "total_payable": l.total_payable, "purpose": l.purpose,
            "status": l.status, "admin_notes": l.admin_notes,
            "amount_repaid": l.amount_repaid, "penalty": l.penalty,
            "balance": l.total_payable - l.amount_repaid,
            "member_name": member.name if member else "",
            "membership_no": member.membership_no if member else "",
            "loan_type": loan_type.name if loan_type else "",
            "supporting_doc": l.supporting_doc, "created_at": l.created_at.isoformat(),
            "risk_score": "High" if total_savings < 5000 else "Medium" if total_savings < 20000 else "Low",
            "total_savings": total_savings, "total_contributions": total_contributions,
            "guarantors": [{"id": g.id, "guarantor_id": g.guarantor_id, "status": g.status} for g in guarantors]
        })
    return jsonify(result)
 
@app.route("/loan-applications/<int:id>/approve", methods=["PUT"])
@jwt_required()
def approve_application(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    data = request.get_json() or {}
    loan.status = "approved"
    loan.approved_by = identity["id"]
    loan.approved_at = datetime.utcnow()
    loan.admin_notes = data.get("notes", "")
    db.session.commit()
    try:
        from dateutil.relativedelta import relativedelta
        start = datetime.utcnow()
        for i in range(1, loan.repayment_months + 1):
            due = start + relativedelta(months=i)
            schedule = LoanRepaymentSchedule(
                loan_id=loan.id, installment_no=i,
                due_date=due.strftime("%Y-%m-%d"),
                amount_due=loan.monthly_installment
            )
            db.session.add(schedule)
        db.session.commit()
    except ImportError:
        pass
    log = LoanAuditLog(loan_id=loan.id, action="APPROVED", performed_by=identity["id"], notes=data.get("notes", ""))
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Loan approved and schedule generated"})

@app.route("/loan-applications/<int:id>/reject", methods=["PUT"])
@jwt_required()
def reject_application(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    data = request.get_json() or {}
    loan.status = "rejected"
    loan.admin_notes = data.get("notes", "")
    log = LoanAuditLog(loan_id=loan.id, action="REJECTED", performed_by=identity["id"], notes=data.get("notes", ""))
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Loan rejected"})
 
@app.route("/loan-applications/<int:id>/request-info", methods=["PUT"])
@jwt_required()
def request_more_info(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    data = request.get_json() or {}
    loan.status = "info_required"
    loan.admin_notes = data.get("notes", "")
    log = LoanAuditLog(loan_id=loan.id, action="MORE_INFO_REQUESTED", performed_by=identity["id"], notes=data.get("notes", ""))
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Info requested"})
 
@app.route("/loan-applications/<int:id>/disburse", methods=["PUT"])
@jwt_required()
def disburse_loan(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    loan.status = "disbursed"
    log = LoanAuditLog(loan_id=loan.id, action="DISBURSED", performed_by=identity["id"])
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Loan disbursed"})


# ================= GUARANTORS =================
@app.route("/guarantors/my-requests", methods=["GET"])
@jwt_required()
def get_my_guarantor_requests():
    identity = get_jwt_identity()
    requests = LoanGuarantor.query.filter_by(
        guarantor_id=identity["id"], status="pending"
    ).all()
    result = []
    for g in requests:
        loan = LoanApplication.query.get(g.loan_id)
        member = Member.query.get(loan.member_id) if loan else None
        result.append({
            "id": g.id, "loan_id": g.loan_id, "status": g.status,
            "member_name": member.name if member else "",
            "membership_no": member.membership_no if member else "",
            "loan_amount": loan.amount if loan else 0,
            "loan_purpose": loan.purpose if loan else "",
            "created_at": g.created_at.isoformat()
        })
    return jsonify(result)

@app.route("/guarantors/<int:id>/respond", methods=["PUT"])
@jwt_required()
def respond_to_guarantor(id):
    g = LoanGuarantor.query.get_or_404(id)
    data = request.get_json()
    g.status = data["status"]  # accepted or rejected
    g.responded_at = datetime.utcnow()

    loan = LoanApplication.query.get(g.loan_id)
    all_guarantors = LoanGuarantor.query.filter_by(loan_id=g.loan_id).all()

    # If any rejected, mark loan as guarantor rejected
    if data["status"] == "rejected":
        loan.status = "guarantor_rejected"
    # If all accepted, move to pending approval
    elif all(gg.status == "accepted" for gg in all_guarantors):
        loan.status = "pending"

    db.session.commit()
    return jsonify({"message": f"Guarantor request {data['status']}"})

# ================= LOAN PAYMENTS =================
@app.route("/loan-payments", methods=["POST"])
@jwt_required()
def make_loan_payment():
    identity = get_jwt_identity()

    proof_file = None
    if "proof_file" in request.files:
        file = request.files["proof_file"]
        file_type = file.content_type or ""
        upload = cloudinary.uploader.upload(
            file,
            resource_type="raw" if "image" not in file_type else "image"
        )
        proof_file = upload["secure_url"]

    loan_id = int(request.form.get("loan_id"))
    amount = float(request.form.get("amount"))
    loan = LoanApplication.query.get_or_404(loan_id)

    payment = LoanPayment(
        loan_id=loan_id, member_id=identity["id"], amount=amount,
        payment_method=request.form.get("payment_method", "cash"),
        mpesa_code=request.form.get("mpesa_code", ""),
        proof_file=proof_file,
        date=request.form.get("date")
    )
    db.session.add(payment)

    loan.amount_repaid += amount
    if loan.status in ["approved", "disbursed"]:
        loan.status = "repaying"

    # Update schedule
    schedule = LoanRepaymentSchedule.query.filter_by(
        loan_id=loan_id, status="pending"
    ).order_by(LoanRepaymentSchedule.installment_no).first()

    if schedule:
        schedule.amount_paid += amount
        if schedule.amount_paid >= schedule.amount_due:
            schedule.status = "paid"
            schedule.paid_at = datetime.utcnow()

    if loan.amount_repaid >= loan.total_payable:
        loan.status = "cleared"
        # Mark all schedule items as paid
        LoanRepaymentSchedule.query.filter_by(loan_id=loan_id).update({"status": "paid"})

    log = LoanAuditLog(loan_id=loan_id, action="PAYMENT_MADE", performed_by=identity["id"],
                       notes=f"KES {amount} via {request.form.get('payment_method', 'cash')}")
    db.session.add(log)
    db.session.commit()

    return jsonify({
        "message": "Payment recorded",
        "amount_repaid": loan.amount_repaid,
        "balance": loan.total_payable - loan.amount_repaid,
        "status": loan.status
    })

@app.route("/loan-payments/<int:loan_id>", methods=["GET"])
@jwt_required()
def get_loan_payments(loan_id):
    payments = LoanPayment.query.filter_by(loan_id=loan_id).order_by(LoanPayment.created_at.desc()).all()
    return jsonify([{
        "id": p.id, "amount": p.amount, "payment_method": p.payment_method,
        "mpesa_code": p.mpesa_code, "proof_file": p.proof_file, "date": p.date,
        "created_at": p.created_at.isoformat()
    } for p in payments])

@app.route("/loan-applications/<int:id>/audit", methods=["GET"])
@jwt_required()
def get_loan_audit(id):
    logs = LoanAuditLog.query.filter_by(loan_id=id).order_by(LoanAuditLog.created_at.desc()).all()
    return jsonify([{
        "action": l.action, "notes": l.notes,
        "performed_by": l.performed_by,
        "created_at": l.created_at.isoformat()
    } for l in logs])

# ================= PENALTY =================
@app.route("/loan-applications/<int:id>/penalty", methods=["PUT"])
@jwt_required()
def add_penalty(id):
    loan = LoanApplication.query.get_or_404(id)
    data = request.get_json()
    loan.penalty += data["amount"]
    loan.total_payable += data["amount"]
    if loan.status == "repaying":
        loan.status = "defaulted"
    identity = get_jwt_identity()
    log = LoanAuditLog(loan_id=id, action="PENALTY_ADDED", performed_by=identity["id"],
                       notes=f"KES {data['amount']} penalty: {data.get('reason', '')}")
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Penalty added"})
# ================= REPAYMENT ACCOUNT =================
@app.route("/repayment-account/<int:loan_id>", methods=["GET"])
@jwt_required()
def get_repayment_account(loan_id):
    identity = get_jwt_identity()
    account = LoanRepaymentAccount.query.filter_by(loan_id=loan_id, member_id=identity["id"]).first()
    if not account:
        return jsonify({"id": None, "balance": 0.0, "transactions": []})
    transactions = RepaymentAccountTransaction.query.filter_by(account_id=account.id).order_by(
        RepaymentAccountTransaction.created_at.desc()).all()
    return jsonify({
        "id": account.id, "balance": account.balance,
        "transactions": [{
            "id": t.id, "amount": t.amount, "transaction_type": t.transaction_type,
            "description": t.description, "mpesa_code": t.mpesa_code,
            "payment_method": t.payment_method, "date": t.date,
            "created_at": t.created_at.isoformat()
        } for t in transactions]
    })
@app.route("/repayment-account/setup", methods=["POST"])
@jwt_required()
def setup_repayment_account():
    identity = get_jwt_identity()
    existing = LoanRepaymentAccount.query.filter_by(member_id=identity["id"]).first()
    if existing:
        return jsonify({"message": "Account already exists", "balance": existing.balance})
    account = LoanRepaymentAccount(member_id=identity["id"])
    db.session.add(account)
    db.session.commit()
    return jsonify({"message": "Repayment account created", "balance": 0.0}), 201

@app.route("/repayment-account/deposit", methods=["POST"])
@jwt_required()
def deposit_to_repayment_account():
    identity = get_jwt_identity()
    data = request.get_json()
    loan_id = int(data["loan_id"])
    amount = float(data["amount"])
    account = LoanRepaymentAccount.query.filter_by(loan_id=loan_id, member_id=identity["id"]).first()
    if not account:
        account = LoanRepaymentAccount(member_id=identity["id"], loan_id=loan_id)
        db.session.add(account)
        db.session.commit()
    account.balance += amount
    txn = RepaymentAccountTransaction(
        account_id=account.id, amount=amount, transaction_type="deposit",
        payment_method=data.get("payment_method", "cash"),
        mpesa_code=data.get("mpesa_code", ""),
        description=data.get("description", "Top up"),
        date=data.get("date", datetime.now().strftime("%Y-%m-%d"))
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify({"message": "Account topped up", "balance": account.balance})


# ================= AUTO DEDUCTION (run via cron or scheduled) =================
@app.route("/admin/process-deductions", methods=["POST"])
@jwt_required()
def process_deductions():
    """Called daily by a scheduler to auto-deduct loan installments"""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    # Find all due installments
    due_schedules = LoanRepaymentSchedule.query.filter_by(
        due_date=today, status="pending"
    ).all()
    
    processed = []
    failed = []
    
    for schedule in due_schedules:
        loan = LoanApplication.query.get(schedule.loan_id)
        if not loan or loan.status not in ["approved", "disbursed", "repaying"]:
            continue
            
        account = LoanRepaymentAccount.query.filter_by(member_id=loan.member_id).first()
        member = Member.query.get(loan.member_id)
        
        if account and account.balance >= schedule.amount_due:
            # Deduct
            account.balance -= schedule.amount_due
            schedule.amount_paid += schedule.amount_due
            schedule.status = "paid"
            schedule.paid_at = datetime.utcnow()
            loan.amount_repaid += schedule.amount_due
            if loan.status in ["approved", "disbursed"]:
                loan.status = "repaying"
            if loan.amount_repaid >= loan.total_payable:
                loan.status = "cleared"
            
            txn = RepaymentAccountTransaction(
                member_id=loan.member_id, amount=schedule.amount_due,
                transaction_type="deduction",
                description=f"Auto-deduction for loan #{loan.id} installment #{schedule.installment_no}",
                loan_id=loan.id
            )
            db.session.add(txn)
            
            payment = LoanPayment(
                loan_id=loan.id, member_id=loan.member_id,
                amount=schedule.amount_due, payment_method="auto_deduction",
                date=today
            )
            db.session.add(payment)
            processed.append(loan.id)
            
            # Send success SMS/email
            if member and member.phone:
                try:
                    sms.send(
                        f"✅ KES {schedule.amount_due} deducted from your repayment account for Loan #{loan.id}. Balance: KES {account.balance}",
                        [member.phone]
                    )
                except Exception as e:
                    print("SMS error:", e)
        else:
            # Insufficient balance - add penalty and notify
            penalty_amount = schedule.amount_due * 0.05  # 5% penalty
            loan.penalty += penalty_amount
            loan.total_payable += penalty_amount
            loan.status = "defaulted"
            schedule.status = "overdue"
            
            db.session.add(LoanAuditLog(
                loan_id=loan.id, action="AUTO_DEDUCTION_FAILED",
                performed_by=1,
                notes=f"Insufficient balance. Penalty KES {penalty_amount} applied."
            ))
            failed.append(loan.id)
            
            # Notify member and guarantors
            if member and member.phone:
                try:
                    sms.send(
                        f"⚠️ URGENT: Your loan repayment of KES {schedule.amount_due} for Loan #{loan.id} is due today but your repayment account has insufficient funds (Balance: KES {account.balance if account else 0}). A penalty of KES {penalty_amount} has been applied. Top up immediately.",
                        [member.phone]
                    )
                except Exception as e:
                    print("SMS error:", e)
            
            # Notify guarantors
            guarantors = LoanGuarantor.query.filter_by(loan_id=loan.id, status="accepted").all()
            for g in guarantors:
                guarantor = Member.query.get(g.guarantor_id)
                if guarantor and guarantor.phone:
                    try:
                        sms.send(
                            f"⚠️ NOTICE: {member.name} (Loan #{loan.id}) has missed a repayment of KES {schedule.amount_due}. As guarantor you may be liable.",
                            [guarantor.phone]
                        )
                    except Exception as e:
                        print("SMS error:", e)
    
    db.session.commit()
    return jsonify({"processed": processed, "failed": failed, "date": today})

# ================= SEND REMINDERS =================
@app.route("/admin/send-reminders", methods=["POST"])
@jwt_required()
def send_reminders():
    """Send reminders 3 days before due date"""
    from datetime import timedelta
    reminder_date = (datetime.utcnow() + timedelta(days=3)).strftime("%Y-%m-%d")
    
    upcoming = LoanRepaymentSchedule.query.filter_by(
        due_date=reminder_date, status="pending"
    ).all()
    
    sent = 0
    for schedule in upcoming:
        loan = LoanApplication.query.get(schedule.loan_id)
        if not loan: continue
        member = Member.query.get(loan.member_id)
        account = LoanRepaymentAccount.query.filter_by(member_id=loan.member_id).first()
        balance = account.balance if account else 0
        
        if member and member.phone:
            try:
                sms.send(
                    f"📅 REMINDER: Your loan installment of KES {schedule.amount_due} for Loan #{loan.id} is due on {schedule.due_date}. Your repayment account balance is KES {balance}. {'✅ Sufficient funds' if balance >= schedule.amount_due else '⚠️ Please top up!'}",
                    [member.phone]
                )
                sent += 1
            except Exception as e:
                print("SMS error:", e)
    
    return jsonify({"reminders_sent": sent, "reminder_date": reminder_date})

# ================= ADMIN STATS =================
@app.route("/admin/stats", methods=["GET"])
@jwt_required()
def admin_stats():
    total_members = Member.query.filter_by(is_active=True).count()
    total_matatus = Matatu.query.count()
    total_loans = LoanApplication.query.count()
    active_loans = LoanApplication.query.filter(
        LoanApplication.status.in_(["approved", "disbursed", "repaying"])
    ).count()
    total_routes = Route.query.filter_by(is_active=True).count()
    total_receipts = Receipt.query.filter_by(is_submitted=True).count()
    total_savings = db.session.query(db.func.sum(Saving.amount)).filter_by(
        transaction_type="deposit"
    ).scalar() or 0
    pending_loans = LoanApplication.query.filter_by(status="pending").count()
    return jsonify({
        "total_members": total_members, "total_matatus": total_matatus,
        "total_loans": total_loans, "active_loans": active_loans,
        "total_routes": total_routes, "total_receipts": total_receipts,
        "total_savings": total_savings, "pending_loans": pending_loans
    })

# Admin see all savings
@app.route("/admin/savings", methods=["GET"])
@jwt_required()
def admin_get_all_savings():
    savings = Saving.query.order_by(Saving.created_at.desc()).all()
    result = []
    for s in savings:
        member = Member.query.get(s.member_id)
        result.append({
            "id": s.id, "member_name": member.name if member else "",
            "membership_no": member.membership_no if member else "",
            "amount": s.amount, "transaction_type": s.transaction_type,
            "description": s.description, "date": s.date, "matatu_id": s.matatu_id
        })
    return jsonify(result)
# ================= RECEIPTS BY ROUTE PER DAY =================
@app.route("/receipts/by-route", methods=["GET"])
@jwt_required()
def receipts_by_route():
    date_filter = request.args.get("date")
    route_id = request.args.get("route_id")
    query = Receipt.query.filter_by(is_submitted=True)
    if date_filter:
        query = query.filter_by(date_issued=date_filter)
    if route_id:
        query = query.filter_by(route_id=int(route_id))
    receipts = query.order_by(Receipt.time_issued).all()
    by_route = {}
    for r in receipts:
        key = f"{r.from_stage} → {r.to_stage}"
        if key not in by_route:
            by_route[key] = {
                "route": key,
                "route_id": r.route_id,
                "from_stage": r.from_stage,
                "to_stage": r.to_stage,
                "count": 0,
                "total": 0.0,
                "receipts": [],
                "operators": {}
            }
        by_route[key]["count"] += 1
        by_route[key]["total"] += r.shimo_fee
        op = r.operator_membership_no or "Unknown"
        if op not in by_route[key]["operators"]:
            by_route[key]["operators"][op] = {"count": 0, "total": 0.0, "name": op}
        by_route[key]["operators"][op]["count"] += 1
        by_route[key]["operators"][op]["total"] += r.shimo_fee
        by_route[key]["receipts"].append({
            "id": r.id,
            "ticket_number": r.ticket_number,
            "plate": r.plate,
            "shimo_fee": r.shimo_fee,
            "mode_of_payment": r.mode_of_payment,
            "time_issued": r.time_issued,
            "operator_membership_no": r.operator_membership_no
        })
    # Flatten operators dict to list
    for key in by_route:
        by_route[key]["operators"] = list(by_route[key]["operators"].values())
    return jsonify({
        "date": date_filter,
        "routes": list(by_route.values()),
        "grand_total": sum(r.shimo_fee for r in receipts),
        "total_tickets": len(receipts)
    })
# ================= ROUTES LIST (for filter dropdown) =================
@app.route("/receipts/route-list", methods=["GET"])
@jwt_required()
def receipt_route_list():
    """Get distinct routes that have receipts"""
    receipts = Receipt.query.filter_by(is_submitted=True).all()
    seen = {}
    for r in receipts:
        key = r.route_id or f"{r.from_stage}-{r.to_stage}"
        if key not in seen:
            seen[key] = {
                "route_id": r.route_id,
                "from_stage": r.from_stage,
                "to_stage": r.to_stage,
                "label": f"{r.from_stage} → {r.to_stage}"
            }
    return jsonify(list(seen.values()))
# ================= SALARY CONFIG =================
@app.route("/salary/config", methods=["GET"])
@jwt_required()
def get_salary_configs():
    configs = SalaryConfig.query.filter_by(is_active=True).all()
    result = []
    for c in configs:
        member = Member.query.get(c.member_id)
        if not member:
            continue
        # Last payment
        last = SalaryPayment.query.filter_by(member_id=c.member_id).order_by(SalaryPayment.created_at.desc()).first()
        result.append({
            "id": c.id,
            "member_id": c.member_id,
            "member_name": member.name,
            "membership_no": member.membership_no,
            "role": member.role,
            "role_label": c.role_label or member.role,
            "base_salary": c.base_salary,
            "payment_frequency": c.payment_frequency,
            "last_paid": last.created_at.isoformat() if last else None,
            "last_amount": last.amount if last else None,
            "last_period": last.period if last else None
        })
    return jsonify(result)
@app.route("/salary/config", methods=["POST"])
@jwt_required()
def create_salary_config():
    identity = get_jwt_identity()
    data = request.get_json()
    existing = SalaryConfig.query.filter_by(member_id=data["member_id"]).first()
    if existing:
        existing.base_salary = data["base_salary"]
        existing.payment_frequency = data["payment_frequency"]
        existing.role_label = data.get("role_label", "")
        existing.is_active = True
        db.session.commit()
        return jsonify({"message": "Config updated", "id": existing.id})
    config = SalaryConfig(
        member_id=data["member_id"],
        base_salary=data["base_salary"],
        payment_frequency=data["payment_frequency"],
        role_label=data.get("role_label", "")
    )
    db.session.add(config)
    # Audit
    member = Member.query.get(data["member_id"])
    log = AuditLogPermanent(
        action="SALARY_CONFIG_SET",
        category="worker",
        member_id=data["member_id"],
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Base salary KES {data['base_salary']} ({data['payment_frequency']})"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Salary config created", "id": config.id}), 201
@app.route("/salary/config/<int:id>", methods=["PUT"])
@jwt_required()
def update_salary_config(id):
    config = SalaryConfig.query.get_or_404(id)
    data = request.get_json()
    config.base_salary = data.get("base_salary", config.base_salary)
    config.payment_frequency = data.get("payment_frequency", config.payment_frequency)
    config.role_label = data.get("role_label", config.role_label)
    config.is_active = data.get("is_active", config.is_active)
    db.session.commit()
    return jsonify({"message": "Updated"})
# ================= SALARY PAYMENTS =================
@app.route("/salary/pay", methods=["POST"])
@jwt_required()
def pay_salary():
    identity = get_jwt_identity()
    data = request.get_json()
    payment = SalaryPayment(
        member_id=data["member_id"],
        amount=data["amount"],
        payment_type=data["payment_type"],
        period=data["period"],
        payment_method=data.get("payment_method", "cash"),
        mpesa_code=data.get("mpesa_code", ""),
        notes=data.get("notes", ""),
        paid_by=identity["id"]
    )
    db.session.add(payment)
    member = Member.query.get(data["member_id"])
    log = AuditLogPermanent(
        action="SALARY_PAID",
        category="worker",
        member_id=data["member_id"],
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"KES {data['amount']} ({data['payment_type']}) period: {data['period']} via {data.get('payment_method','cash')}"
    )
    db.session.add(log)
    db.session.commit()
    if member and member.phone:
        try:
            sms.send(
                f"✅ Salary: KES {data['amount']} for {data['period']} via {data.get('payment_method','cash')}. - SACCO HR",
                [member.phone]
            )
        except Exception as e:
            print("SMS error:", e)
    return jsonify({"message": "Salary paid", "id": payment.id}), 201
@app.route("/salary/payments", methods=["GET"])
@jwt_required()
def get_salary_payments():
    member_id = request.args.get("member_id")
    query = SalaryPayment.query
    if member_id:
        query = query.filter_by(member_id=int(member_id))
    payments = query.order_by(SalaryPayment.created_at.desc()).all()
    result = []
    for p in payments:
        member = Member.query.get(p.member_id)
        result.append({
            "id": p.id,
            "member_id": p.member_id,
            "member_name": member.name if member else "",
            "membership_no": member.membership_no if member else "",
            "amount": p.amount,
            "payment_type": p.payment_type,
            "period": p.period,
            "payment_method": p.payment_method,
            "mpesa_code": p.mpesa_code,
            "notes": p.notes,
            "created_at": p.created_at.isoformat()
        })
    return jsonify(result)
@app.route("/salary/payments/my", methods=["GET"])
@jwt_required()
def get_my_salary():
    identity = get_jwt_identity()
    payments = SalaryPayment.query.filter_by(member_id=identity["id"]).order_by(SalaryPayment.created_at.desc()).all()
    return jsonify([{
        "id": p.id, "amount": p.amount, "payment_type": p.payment_type,
        "period": p.period, "payment_method": p.payment_method,
        "notes": p.notes, "created_at": p.created_at.isoformat()
    } for p in payments])

# ================= WORKER WARNINGS =================
@app.route("/workers/warnings", methods=["POST"])
@jwt_required()
def issue_warning():
    identity = get_jwt_identity()
    data = request.get_json()
    warning = WorkerWarning(
        member_id=data["member_id"],
        severity=data.get("severity", "minor"),
        reason=data["reason"],
        issued_by=identity["id"]
    )
    db.session.add(warning)
    member = Member.query.get(data["member_id"])
    log = AuditLogPermanent(
        action=f"WARNING_{data.get('severity','minor').upper()}_ISSUED",
        category="worker",
        member_id=data["member_id"],
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=data["reason"]
    )
    db.session.add(log)
    db.session.commit()
    if member and member.phone:
        severity_label = data.get("severity", "minor").upper()
        try:
            sms.send(
                f"⚠️ {severity_label} WARNING from SACCO HR: {data['reason'][:100]}. Report to the SACCO office.",
                [member.phone]
            )
        except Exception as e:
            print("SMS error:", e)
    return jsonify({"message": "Warning issued", "id": warning.id}), 201
@app.route("/workers/warnings/all", methods=["GET"])
@jwt_required()
def get_all_warnings():
    warnings = WorkerWarning.query.order_by(WorkerWarning.created_at.desc()).all()
    result = []
    for w in warnings:
        member = Member.query.get(w.member_id)
        issuer = Member.query.get(w.issued_by)
        result.append({
            "id": w.id,
            "member_id": w.member_id,
            "member_name": member.name if member else "",
            "membership_no": member.membership_no if member else "",
            "role": member.role if member else "",
            "severity": w.severity,
            "reason": w.reason,
            "issued_by_name": issuer.name if issuer else "Unknown",
            "is_acknowledged": w.is_acknowledged,
            "acknowledged_at": w.acknowledged_at.isoformat() if w.acknowledged_at else None,
            "created_at": w.created_at.isoformat()
        })
    return jsonify(result)
@app.route("/workers/warnings/<int:member_id>/member", methods=["GET"])
@jwt_required()
def get_member_warnings(member_id):
    warnings = WorkerWarning.query.filter_by(member_id=member_id).order_by(WorkerWarning.created_at.desc()).all()
    result = []
    for w in warnings:
        issuer = Member.query.get(w.issued_by)
        result.append({
            "id": w.id, "severity": w.severity, "reason": w.reason,
            "issued_by_name": issuer.name if issuer else "Unknown",
            "is_acknowledged": w.is_acknowledged,
            "created_at": w.created_at.isoformat()
        })
    return jsonify(result)
@app.route("/workers/warnings/<int:id>/acknowledge", methods=["PUT"])
@jwt_required()
def acknowledge_warning(id):
    w = WorkerWarning.query.get_or_404(id)
    w.is_acknowledged = True
    w.acknowledged_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"message": "Warning acknowledged"})
# ================= WORKER PERFORMANCE SUMMARY =================
@app.route("/workers/summary/<int:member_id>", methods=["GET"])
@jwt_required()
def worker_summary(member_id):
    member = Member.query.get_or_404(member_id)
    receipts = Receipt.query.filter_by(issued_by=member_id, is_submitted=True).all()
    earnings = DailyEarning.query.filter_by(submitted_by=member_id).all()
    warnings = WorkerWarning.query.filter_by(member_id=member_id).all()
    salary_payments = SalaryPayment.query.filter_by(member_id=member_id).order_by(SalaryPayment.created_at.desc()).all()
    loans = LoanApplication.query.filter_by(member_id=member_id).all()
    config = SalaryConfig.query.filter_by(member_id=member_id, is_active=True).first()
    return jsonify({
        "member": {
            "id": member.id,
            "name": member.name,
            "membership_no": member.membership_no,
            "role": member.role,
            "phone": member.phone
        },
        "stats": {
            "receipts_issued": len(receipts),
            "total_collected": sum(r.shimo_fee for r in receipts),
            "earnings_submitted": len(earnings),
            "warnings_total": len(warnings),
            "warnings_unacknowledged": sum(1 for w in warnings if not w.is_acknowledged),
            "salary_payments": len(salary_payments),
            "total_salary_paid": sum(p.amount for p in salary_payments),
            "active_loans": sum(1 for l in loans if l.status in ["approved", "disbursed", "repaying"])
        },
        "salary_config": {
            "base_salary": config.base_salary if config else 0,
            "payment_frequency": config.payment_frequency if config else "monthly"
        } if config else None,
        "recent_salary": [{
            "amount": p.amount, "period": p.period,
            "payment_method": p.payment_method,
            "created_at": p.created_at.isoformat()
        } for p in salary_payments[:5]],
        "warnings": [{
            "severity": w.severity, "reason": w.reason[:80],
            "is_acknowledged": w.is_acknowledged,
            "created_at": w.created_at.isoformat()
        } for w in warnings[:5]]
    })
# ================= ADMIN: DELETE LOAN TYPE =================
@app.route("/loan-types/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_loan_type(id):
    lt = LoanType.query.get_or_404(id)
    active = LoanApplication.query.filter_by(loan_type_id=id).filter(
        LoanApplication.status.in_(["pending", "guarantors_pending", "approved", "disbursed", "repaying"])
    ).count()
    if active > 0:
        return jsonify({"error": f"Cannot delete: {active} active loan(s) use this type"}), 400
    db.session.delete(lt)
    db.session.commit()
    return jsonify({"message": "Loan type deleted"})
# ================= ADMIN: DELETE RECEIPT =================
@app.route("/receipts/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_receipt(id):
    identity = get_jwt_identity()
    receipt = Receipt.query.get_or_404(id)
    ticket_no = receipt.ticket_number
    db.session.delete(receipt)
    log = AuditLogPermanent(
        action="RECEIPT_DELETED",
        category="receipt",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Ticket {ticket_no} permanently deleted"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Receipt deleted"})
@app.route("/receipts/summary", methods=["GET"])
@jwt_required()
def daily_summary():
    identity = get_jwt_identity()
    date_filter = request.args.get("date")
    query = Receipt.query.filter_by(issued_by=identity["id"], is_submitted=True)
    if date_filter:
        query = query.filter_by(date_issued=date_filter)
    receipts = query.all()
    total = sum(r.shimo_fee for r in receipts)
    by_route = {}
    for r in receipts:
        key = f"{r.from_stage} → {r.to_stage}"
        if key not in by_route:
            by_route[key] = {"count": 0, "total": 0}
        by_route[key]["count"] += 1
        by_route[key]["total"] += r.shimo_fee
    return jsonify({"date": date_filter, "total_tickets": len(receipts),
                    "total_amount": total, "by_route": by_route})
# ================= HR: SEND LOAN REMINDER =================
@app.route("/loans/send-reminder/<int:id>", methods=["POST"])
@jwt_required()
def send_loan_reminder(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    member = Member.query.get(loan.member_id)
    data = request.get_json() or {}
    message = data.get("message", f"REMINDER: Your loan of KES {loan.amount:,.0f} has a balance of KES {loan.total_payable - loan.amount_repaid:,.0f}. Please ensure timely repayment. - SACCO HR")
    if member and member.phone:
        try:
            sms.send(message, [member.phone])
        except Exception as e:
            return jsonify({"error": f"SMS failed: {str(e)}"}), 500
    log = AuditLogPermanent(
        action="LOAN_REMINDER_SENT",
        category="loan",
        member_id=member.id if member else None,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Reminder sent for Loan #{id}"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Reminder sent"})
# ================= ADMIN: DELETE LOAN APPLICATION =================
@app.route("/loan-applications/<int:id>/delete", methods=["DELETE"])
@jwt_required()
def delete_loan_application(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    
    # Only allow deletion of non-active loans
    safe_statuses = ["pending", "guarantors_pending", "rejected", "guarantor_rejected", "info_required"]
    if loan.status not in safe_statuses:
        return jsonify({"error": f"Cannot delete a loan with status '{loan.status}'. Only pending/rejected loans can be deleted."}), 400
    
    # Delete related records first (cascade)
    LoanGuarantor.query.filter_by(loan_id=id).delete()
    LoanAuditLog.query.filter_by(loan_id=id).delete()
    LoanRepaymentSchedule.query.filter_by(loan_id=id).delete()
    LoanRepaymentAccount.query.filter_by(loan_id=id).delete()
    
    db.session.delete(loan)
    
    # Log it
    log = AuditLogPermanent(
        action="LOAN_APPLICATION_DELETED",
        category="loan",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Loan #{id} (status: {loan.status}) deleted by admin"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": f"Loan #{id} deleted successfully"})

# Assign route to matatu
@app.route("/matatus/<int:id>/assign-route", methods=["PUT"])
@jwt_required()
def assign_route_to_matatu(id):
    matatu = Matatu.query.get_or_404(id)
    data = request.get_json()
    matatu.route_id = data["route_id"]
    db.session.commit()
    return jsonify({"message": "Route assigned"})

# Matatu daily records (earnings+expenditures+savings for a date, shared between driver & conductor)
@app.route("/matatu/daily-records", methods=["GET"])
@jwt_required()
def get_matatu_daily_records():
    identity = get_jwt_identity()
    matatu_id = request.args.get("matatu_id")
    date_filter = request.args.get("date")
    if not matatu_id:
        return jsonify({"error": "matatu_id required"}), 400

    earnings = DailyEarning.query.filter_by(matatu_id=matatu_id)
    expenditures = Expenditure.query.filter_by(matatu_id=matatu_id)
    savings = Saving.query.filter_by(matatu_id=matatu_id)

    if date_filter:
        earnings = earnings.filter_by(date=date_filter)
        expenditures = expenditures.filter_by(date=date_filter)
        savings = savings.filter(Saving.date == date_filter)

    earnings = earnings.order_by(DailyEarning.created_at.desc()).all()
    expenditures = expenditures.order_by(Expenditure.created_at.desc()).all()
    savings = savings.order_by(Saving.created_at.desc()).all()

    def get_submitter(member_id):
        m = Member.query.get(member_id)
        return {"id": m.id, "name": m.name, "role": m.role, "membership_no": m.membership_no} if m else {}

    return jsonify({
        "earnings": [{"id": e.id, "amount": e.amount, "date": e.date,
                      "proof_file": e.proof_file, "notes": e.notes,
                      "is_confirmed": e.is_confirmed,
                      "submitted_by": get_submitter(e.submitted_by)} for e in earnings],
        "expenditures": [{"id": e.id, "amount": e.amount, "description": e.description,
                          "date": e.date, "proof_file": e.proof_file,
                          "submitted_by": get_submitter(e.submitted_by)} for e in expenditures],
        "savings": [{"id": s.id, "amount": s.amount, "transaction_type": s.transaction_type,
                     "description": s.description, "date": s.date,
                     "submitted_by": get_submitter(s.member_id)} for s in savings],
        "totals": {
            "earnings": sum(e.amount for e in earnings),
            "expenditures": sum(e.amount for e in expenditures),
            "savings": sum(s.amount for s in savings if s.transaction_type=="deposit") - sum(s.amount for s in savings if s.transaction_type=="withdrawal")
        }
    })

# Owner: records per matatu per date (all submissions from any crew)
@app.route("/owner/matatu-records", methods=["GET"])
@jwt_required()
def owner_matatu_records():
    identity = get_jwt_identity()
    matatu_id = request.args.get("matatu_id")
    date_filter = request.args.get("date")

    # Verify ownership
    matatu = Matatu.query.get_or_404(matatu_id)
    if matatu.owner_member_no != identity["membership_no"]:
        return jsonify({"error": "Unauthorized"}), 403

    earnings = DailyEarning.query.filter_by(matatu_id=matatu_id)
    expenditures = Expenditure.query.filter_by(matatu_id=matatu_id)
    savings = Saving.query.filter_by(matatu_id=matatu_id)

    if date_filter:
        earnings = earnings.filter_by(date=date_filter)
        expenditures = expenditures.filter_by(date=date_filter)
        savings = savings.filter(Saving.date == date_filter)

    earnings = earnings.order_by(DailyEarning.created_at.desc()).all()
    expenditures = expenditures.order_by(Expenditure.created_at.desc()).all()
    savings = savings.order_by(Saving.created_at.desc()).all()

    def submitter(member_id):
        m = Member.query.get(member_id)
        return {"name": m.name, "role": m.role, "membership_no": m.membership_no} if m else {}

    return jsonify({
        "matatu": {"id": matatu.id, "plate": matatu.plate},
        "earnings": [{"id": e.id, "amount": e.amount, "date": e.date,
                      "proof_file": e.proof_file, "notes": e.notes,
                      "is_confirmed": e.is_confirmed,
                      "submitted_by": submitter(e.submitted_by)} for e in earnings],
        "expenditures": [{"id": e.id, "amount": e.amount, "description": e.description,
                          "date": e.date, "proof_file": e.proof_file,
                          "submitted_by": submitter(e.submitted_by)} for e in expenditures],
        "savings": [{"id": s.id, "amount": s.amount, "transaction_type": s.transaction_type,
                     "description": s.description, "date": s.date,
                     "submitted_by": submitter(s.member_id)} for s in savings],
        "totals": {
            "earnings": sum(e.amount for e in earnings),
            "expenditures": sum(e.amount for e in expenditures),
            "savings_balance": sum(s.amount for s in savings if s.transaction_type=="deposit") - sum(s.amount for s in savings if s.transaction_type=="withdrawal")
        }
    })

# Guarantor history (accepted + rejected, not just pending)
@app.route("/guarantors/my-history", methods=["GET"])
@jwt_required()
def get_my_guarantor_history():
    identity = get_jwt_identity()
    reqs = LoanGuarantor.query.filter_by(guarantor_id=identity["id"]).all()
    result = []
    for g in reqs:
        loan = LoanApplication.query.get(g.loan_id)
        member = Member.query.get(loan.member_id) if loan else None
        loan_type = LoanType.query.get(loan.loan_type_id) if loan else None
        result.append({
            "id": g.id, "loan_id": g.loan_id, "status": g.status,
            "member_name": member.name if member else "",
            "membership_no": member.membership_no if member else "",
            "loan_amount": loan.amount if loan else 0,
            "loan_status": loan.status if loan else "",
            "loan_type": loan_type.name if loan_type else "",
            "loan_purpose": loan.purpose if loan else "",
            "amount_repaid": loan.amount_repaid if loan else 0,
            "total_payable": loan.total_payable if loan else 0,
            "responded_at": g.responded_at.isoformat() if g.responded_at else None,
            "created_at": g.created_at.isoformat()
        })
    # Sort: pending first, then by date
    result.sort(key=lambda x: (x["status"] != "pending", x["created_at"]), reverse=False)
    return jsonify(result)

# ── Loan type: terms & conditions upload ──
@app.route("/loan-types/<int:id>/terms", methods=["PUT"])
@jwt_required()
def upload_loan_type_terms(id):
    lt = LoanType.query.get_or_404(id)
    file = request.files.get("terms_file")
    if not file: return jsonify({"error": "No file"}), 400
    file_type = file.content_type or ""
    upload = cloudinary.uploader.upload(file, resource_type="raw" if "image" not in file_type else "image")
    lt.terms_file = upload["secure_url"]
    db.session.commit()
    return jsonify({"message": "Terms uploaded", "url": lt.terms_file})
# ── Loan disbursement proof ──
@app.route("/loan-applications/<int:id>/disburse-proof", methods=["POST"])
@jwt_required()
def upload_disburse_proof(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    if "proof" in request.files:
        file = request.files["proof"]
        file_type = file.content_type or ""
        upload = cloudinary.uploader.upload(file, resource_type="image" if "image" in file_type else "raw")
        loan.disburse_proof = upload["secure_url"]
        loan.disburse_note = request.form.get("note","")
        db.session.commit()
    log = AuditLogPermanent(
        action="DISBURSE_PROOF_UPLOADED", category="loan",
        performed_by_id=identity["id"], performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Loan #{id} disbursement proof uploaded"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Proof uploaded", "disburse_proof": loan.disburse_proof})

# ── Borrower responds to info_required ──
@app.route("/loan-applications/<int:id>/respond-info", methods=["PUT"])
@jwt_required()
def respond_to_info_request(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    if loan.member_id != identity["id"]:
        return jsonify({"error": "Unauthorized"}), 403
    data = request.get_json()
    loan.borrower_response = data.get("response","")
    loan.status = "pending"  # re-submit for review
    log = LoanAuditLog(loan_id=id, action="BORROWER_INFO_SUBMITTED",
                       performed_by=identity["id"], notes=data.get("response",""))
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Response submitted, loan back under review"})

# ── Penalties by loan type ──
@app.route("/loan-types/<int:id>/penalty-policy", methods=["PUT"])
@jwt_required()
def update_penalty_policy(id):
    lt = LoanType.query.get_or_404(id)
    data = request.get_json()
    lt.penalty_rate = data.get("penalty_rate", lt.penalty_rate)  # % per missed payment
    lt.grace_period_days = data.get("grace_period_days", lt.grace_period_days)
    lt.penalty_description = data.get("penalty_description", "")
    db.session.commit()
    return jsonify({"message": "Penalty policy updated"})
@app.route("/loan-types/<int:id>/penalty-policy", methods=["POST"])
@jwt_required()
def set_penalty_policy(id):
    lt = LoanType.query.get_or_404(id)
    data = request.get_json()
    lt.penalty_rate = data.get("penalty_rate", 5.0)
    lt.grace_period_days = data.get("grace_period_days", 3)
    lt.penalty_description = data.get("penalty_description", "")
    db.session.commit()
    return jsonify({"message": "Penalty policy saved"})
# ================= RUN =================
if __name__ == "__main__":
    app.run(debug=True)
