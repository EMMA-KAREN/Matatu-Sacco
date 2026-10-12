import os
import re 
import json
import cloudinary
from dotenv import load_dotenv
# 1. Load the .env file and force override any existing system shell variables
load_dotenv(override=True) 
import cloudinary.uploader
import africastalking
import requests
import base64
import random
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from models import db, Matatu, Document, Ticket, Progress, Member, Payment, Route,Notification,LoanLedgerEntry, Receipt, Assignment, DailyEarning, Expenditure, Saving, LoanRequest, LoanRepayment, SaccoPayment, LoanType, LoanApplication, LoanGuarantor, LoanRepaymentSchedule, LoanPayment, LoanAuditLog,LoanRepaymentAccount,RepaymentAccountTransaction,AuditLogPermanent,SalaryConfig,SalaryPayment,WorkerWarning,SaccoSetting,StageExpense,PenaltyLog,WelfareLedger,CasualPayment
from config import Config
from flask_migrate import Migrate
from datetime import datetime, timedelta
from flask_migrate import upgrade
from sqlalchemy.exc import IntegrityError
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity
)

app = Flask(__name__, static_folder="build", static_url_path="/")
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
# 1. Force remove the hidden system variable overriding your config
if "CLOUDINARY_URL" in os.environ:
    del os.environ["CLOUDINARY_URL"]

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
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

    
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react(path):
    if path != "" and os.path.exists(app.static_folder + "/" + path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")

# Add this temporary route to your main file
@app.route('/create-the-db-tables-992')
def init_db():
    try:
        db.create_all()
        return "Database tables created successfully!"
    except Exception as e:
        return f"An error occurred: {str(e)}"
# Add this temporary route to your main file
@app.route('/run-my-migrations-992')
def run_migrations():
    try:
        upgrade()
        return "Migrations run successfully!"
    except Exception as e:
        return f"An error occurred: {str(e)}"
    
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

# ================= INIT & AUTO-MIGRATIONS =================
# ================= INIT & AUTO-MIGRATIONS =================
with app.app_context():
    upload_folder = app.config.get("UPLOAD_FOLDER", "uploads")
    os.makedirs(upload_folder, exist_ok=True)

    # 1. Add pending_edit to loan_application table
    try:
        with db.engine.connect() as conn:
            conn.execute(db.text("ALTER TABLE loan_application ADD COLUMN pending_edit TEXT"))
            conn.commit()
            print("✓ Successfully added 'pending_edit' column to loan_application table!")
    except Exception as e:
        pass  # Column already exists

    # 2. Add is_rejected to member table
    try:
        with db.engine.connect() as conn:
            conn.execute(db.text("ALTER TABLE member ADD COLUMN is_rejected BOOLEAN DEFAULT 0"))
            conn.commit()
    except Exception:
        pass
# ================= FILES =================
@app.route("/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(app.config.get("UPLOAD_FOLDER", "uploads"), filename)



# ================= PASSWORD RECOVERY & ADMIN OVERRIDE =================

# 1. User Self-Service: Forgot / Reset Password by Membership No & National ID
@app.route("/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json()
    membership_no = (data.get("membership_no") or "").strip().upper()
    national_id = (data.get("national_id") or "").strip()
    new_password = (data.get("new_password") or "").strip()

    if not membership_no or not national_id or not new_password:
        return jsonify({"error": "Membership Number, National ID, and new password are required."}), 400

    member = Member.query.filter_by(membership_no=membership_no, national_id=national_id).first()
    if not member:
        return jsonify({"error": "No member found matching those credentials."}), 404

    member.set_password(new_password)
    db.session.commit()

    # Log action permanently
    log = AuditLogPermanent(
        action="PASSWORD_SELF_RESET",
        category="member",
        member_id=member.id,
        membership_no=member.membership_no,
        performed_by_id=member.id,
        performed_by_name=member.name,
        performed_by_role=member.role,
        details="User successfully reset password using National ID verification"
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({"message": "Password reset successfully. You can now login with your new password."}), 200


# 2. Admin Direct Override: Admin resets or sets a password for any member
@app.route("/admin/member/<int:id>/reset-password", methods=["PUT"])
@jwt_required()
def admin_reset_member_password(id):
    identity = get_jwt_identity()
    if identity.get("role") not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    new_password = (data.get("new_password") or "").strip()

    if not new_password:
        return jsonify({"error": "New password cannot be blank."}), 400

    member = Member.query.get_or_404(id)
    member.set_password(new_password)
    db.session.commit()

    log = AuditLogPermanent(
        action="ADMIN_PASSWORD_OVERRIDE",
        category="member",
        member_id=member.id,
        membership_no=member.membership_no,
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Admin {identity['name']} changed password for {member.name} ({member.membership_no})"
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({"message": f"Password for {member.name} successfully updated!"}), 200
# ── 1. UNIFIED EDIT (HR Proposes -> Staged; Admin Edits -> Applies & Notifies HR) ──
@app.route("/loan-applications/<int:id>/edit", methods=["PUT"])
@jwt_required()
def edit_loan_application(id):
    identity = get_jwt_identity()
    user_role = identity.get("role")
    if user_role not in ["hr", "admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403

    loan = LoanApplication.query.get_or_404(id)
    data = request.get_json() or {}

    new_amount = float(data.get("amount", loan.amount))
    new_interest = float(data.get("interest_rate", loan.interest_rate))
    new_months = int(data.get("repayment_months", loan.repayment_months))
    new_purpose = data.get("purpose", loan.purpose)
    notes = data.get("notes", "")

    total_interest = (new_amount * new_interest / 100) * (new_months / 12)
    new_total_payable = round(new_amount + total_interest, 2)
    new_monthly_installment = round(new_total_payable / new_months, 2) if new_months else 0

    member = Member.query.get(loan.member_id)

    # ── CASE A: HR PROPOSES (Pending Admin Approval) ──
   # ── CASE A: HR EDITS (Staged for Admin Approval) ──
    if user_role == "hr":
        proposal = {
            "proposed_by_id": identity["id"],
            "proposed_by_name": identity["name"],
            "proposed_at": datetime.utcnow().isoformat(),
            "amount": new_amount,
            "interest_rate": new_interest,
            "repayment_months": new_months,
            "total_payable": new_total_payable,
            "monthly_installment": new_monthly_installment,
            "purpose": new_purpose,
            "notes": notes,
            "old_amount": loan.amount,
            "old_interest_rate": loan.interest_rate,
            "old_repayment_months": loan.repayment_months,
            "old_total_payable": loan.total_payable,
            "old_monthly_installment": loan.monthly_installment,
            "old_purpose": loan.purpose
        }
        loan.pending_edit = json.dumps(proposal)
        db.session.commit()

        # Case-insensitive query ensuring all active admins/directors receive notification
        admins = Member.query.filter(
            db.func.lower(db.func.trim(Member.role)).in_(["admin", "director"]),
            Member.is_active != False
        ).all()

        # Fallback if roles were customized (e.g. 'superadmin')
       # Locate all active admins or directors
        admins = Member.query.filter(
            db.or_(
                db.func.lower(Member.role).like("%admin%"),
                db.func.lower(Member.role).like("%director%")
            )
        ).all()

        borrower_name = member.name if member else f"Member #{loan.member_id}"

        for a in admins:
            db.session.add(Notification(
                recipient_id=a.id,
                sender_name=f"HR ({identity['name']})",
                type="loan",
                title="⚠️ Loan Edit Awaiting Approval",
                message=f"HR {identity['name']} proposed adjustments for Loan #{loan.id} ({borrower_name}): KES {loan.amount:,.0f} ➔ KES {new_amount:,.0f}. Reason: '{notes or 'Term review'}'.",
                is_read=False,
                created_at=datetime.utcnow()  # Explicit timestamp
            ))

     

            # Optional: SMS dispatch to Admin
            if a.phone and sms:
                try:
                    sms.send(
                        f"⚠️ SACCO ADMIN: HR {identity['name']} proposed edits for Loan #{loan.id} ({borrower_name}). Please review in Admin Portal.",
                        [a.phone]
                    )
                except Exception as err:
                    print("Admin notification SMS failed:", err)

        db.session.add(AuditLogPermanent(
            action="LOAN_EDIT_PROPOSED_BY_HR",
            category="loan",
            member_id=loan.member_id,
            membership_no=member.membership_no if member else "",
            performed_by_id=identity["id"],
            performed_by_name=identity["name"],
            performed_by_role=identity["role"],
            details=f"HR proposed modifications to Loan #{loan.id}: Amount {loan.amount}->{new_amount}, Rate {loan.interest_rate}->{new_interest}%. Awaiting Admin approval."
        ))
        db.session.commit()

        return jsonify({
            "message": "Loan edit submitted. Awaiting Admin final authorization to take effect.",
            "pending_edit": proposal
        }), 200

    # ── CASE B: ADMIN DIRECT EDIT (Live immediately; notifies HR) ──
    else:
        old_amount = loan.amount
        old_rate = loan.interest_rate
        old_months = loan.repayment_months

        loan.amount = new_amount
        loan.interest_rate = new_interest
        loan.repayment_months = new_months
        loan.total_payable = new_total_payable
        loan.monthly_installment = new_monthly_installment
        loan.purpose = new_purpose
        loan.pending_edit = None  # Clear any existing pending edit proposals

        # Recalculate unpaid installments
        schedules = LoanRepaymentSchedule.query.filter_by(loan_id=loan.id).filter(
            LoanRepaymentSchedule.status != "paid"
        ).all()
        for s in schedules:
            s.amount_due = new_monthly_installment

        db.session.commit()

        # Notify ALL HR staff
        hr_members = Member.query.filter(Member.role == "hr", Member.is_active == True).all()
        for hr in hr_members:
            db.session.add(Notification(
                recipient_id=hr.id,
                sender_name=f"Admin ({identity['name']})",
                type="loan",
                title="Loan Terms Modified by Admin",
                message=f"Admin {identity['name']} directly updated Loan #{loan.id} ({member.name if member else 'Member'}). New Terms: KES {new_amount:,.2f} at {new_interest}% for {new_months} months."
            ))

        db.session.add(AuditLogPermanent(
            action="LOAN_EDIT_BY_ADMIN",
            category="loan",
            member_id=loan.member_id,
            membership_no=member.membership_no if member else "",
            performed_by_id=identity["id"],
            performed_by_name=identity["name"],
            performed_by_role=identity["role"],
            details=f"Admin directly updated Loan #{loan.id}: Amount {old_amount}->{new_amount}, Rate {old_rate}->{new_interest}%. HR team notified."
        ))
        db.session.commit()

        return jsonify({
            "message": "Loan updated directly by Admin. HR notified ✓",
            "loan": {
                "id": loan.id,
                "amount": loan.amount,
                "interest_rate": loan.interest_rate,
                "repayment_months": loan.repayment_months,
                "total_payable": loan.total_payable,
                "monthly_installment": loan.monthly_installment,
                "purpose": loan.purpose
            }
        }), 200

# ── 2. ADMIN APPROVES HR'S PROPOSAL ──
@app.route("/loan-applications/<int:id>/approve-edit", methods=["PUT"])
@jwt_required()
def approve_loan_edit(id):
    identity = get_jwt_identity()
    if identity.get("role") not in ["admin", "director"]:
        return jsonify({"error": "Only Admin or Director can authorize loan edits"}), 403

    loan = LoanApplication.query.get_or_404(id)
    if not getattr(loan, "pending_edit", None):
        return jsonify({"error": "No pending edit found for this loan"}), 400

    try:
        proposal = json.loads(loan.pending_edit) if isinstance(loan.pending_edit, str) else loan.pending_edit
    except Exception:
        proposal = {}

    if not proposal:
        return jsonify({"error": "Invalid proposal payload"}), 400

    # Apply proposed changes
    loan.amount = float(proposal.get("amount", loan.amount))
    loan.interest_rate = float(proposal.get("interest_rate", loan.interest_rate))
    loan.repayment_months = int(proposal.get("repayment_months", loan.repayment_months))
    loan.total_payable = float(proposal.get("total_payable", loan.total_payable))
    loan.monthly_installment = float(proposal.get("monthly_installment", loan.monthly_installment))
    loan.purpose = proposal.get("purpose", loan.purpose)
    loan.pending_edit = None

    # Update unpaid installments
    schedules = LoanRepaymentSchedule.query.filter_by(loan_id=loan.id).filter(
        LoanRepaymentSchedule.status != "paid"
    ).all()
    for s in schedules:
        s.amount_due = loan.monthly_installment

    member = Member.query.get(loan.member_id)

    # Notify HR that changes are live
    hr_members = Member.query.filter(Member.role == "hr", Member.is_active == True).all()
    for hr in hr_members:
        db.session.add(Notification(
            recipient_id=hr.id,
            sender_name=f"Admin ({identity['name']})",
            type="loan",
            title="Loan Edit Approved ✅",
            message=f"Admin {identity['name']} authorized the proposed edits for Loan #{loan.id} ({member.name if member else 'Member'}). Changes are now live."
        ))

    log = AuditLogPermanent(
        action="LOAN_EDIT_APPROVED_BY_ADMIN",
        category="loan",
        member_id=loan.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Admin approved HR proposed edits for Loan #{loan.id}. New amount: KES {loan.amount:,.2f}, New payable: KES {loan.total_payable:,.2f}"
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({"message": "Proposed loan edits approved and applied successfully ✓"}), 200


# 4. Admin Rejects HR's Proposed Edit
@app.route("/loan-applications/<int:id>/reject-edit", methods=["PUT"])
@jwt_required()
def reject_loan_edit(id):
    identity = get_jwt_identity()
    if identity.get("role") not in ["admin", "director"]:
        return jsonify({"error": "Only Admin or Director can reject loan edits"}), 403

    loan = LoanApplication.query.get_or_404(id)
    if not getattr(loan, "pending_edit", None):
        return jsonify({"error": "No pending edit found for this loan"}), 400

    loan.pending_edit = None
    db.session.commit()

    member = Member.query.get(loan.member_id)
    hr_members = Member.query.filter(Member.role == "hr", Member.is_active == True).all()
    for hr in hr_members:
        db.session.add(Notification(
            recipient_id=hr.id,
            sender_name=f"Admin ({identity['name']})",
            type="loan",
            title="Loan Edit Rejected ❌",
            message=f"Admin {identity['name']} declined the proposed edits for Loan #{loan.id} ({member.name if member else 'Member'}). Original terms remain unchanged."
        ))

    log = AuditLogPermanent(
        action="LOAN_EDIT_REJECTED_BY_ADMIN",
        category="loan",
        member_id=loan.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Admin declined proposed edits for Loan #{loan.id}."
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({"message": "Proposed loan edits rejected."}), 200

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
    
    from models import (
        Receipt, 
        DailyEarning, 
        Expenditure, 
        Saving, 
        SaccoPayment, 
        LoanApplication, 
        Assignment, 
        Document, 
        Progress
    )
    
    try:
        # 1. Retrieve or create a global 'RETIRED' vehicle profile to hold historical records
        retired_matatu = Matatu.query.filter_by(plate="RETIRED").first()
        if not retired_matatu:
            retired_matatu = Matatu(
                plate="RETIRED",
                owner_member_no=matatu.owner_member_no,  # Copies valid owner to bypass ForeignKey constraints
                driver_name="N/A",
                driver_id="N/A",
                conductor_id="N/A"
            )
            db.session.add(retired_matatu)
            db.session.flush()  # Generates database ID for retired_matatu

        target_id = retired_matatu.id

        # 2. Re-assign all historical logs to the RETIRED ID instead of setting to None
        Receipt.query.filter_by(matatu_id=id).update({Receipt.matatu_id: target_id})
        DailyEarning.query.filter_by(matatu_id=id).update({DailyEarning.matatu_id: target_id})
        Expenditure.query.filter_by(matatu_id=id).update({Expenditure.matatu_id: target_id})
        Saving.query.filter_by(matatu_id=id).update({Saving.matatu_id: target_id})
        SaccoPayment.query.filter_by(matatu_id=id).update({SaccoPayment.matatu_id: target_id})
        LoanApplication.query.filter_by(matatu_id=id).update({LoanApplication.matatu_id: target_id})
        
        db.session.flush()

        # 3. Cascade delete temporary/non-audited Matatu files
        Document.query.filter_by(matatu_id=id).delete()
        Progress.query.filter_by(matatu_id=id).delete()
        Assignment.query.filter_by(matatu_id=id).delete()
        
        # 4. Safely delete the selected Matatu row
        db.session.delete(matatu)
        db.session.commit()
        
        return jsonify({"message": "Matatu retired successfully. Historical transaction data preserved under RETIRED status ✓"})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Failed to retire matatu: {str(e)}"}), 500

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
# ================= MEMBERS =================
@app.route("/hr/members")
def get_members():
    members = Member.query.filter_by(is_active=True).all()
    print("ACTIVE MEMBERS:", [m.membership_no for m in members])

    return jsonify([
        {
            "id": m.id,
            "name": m.name,
            "membership_no": m.membership_no,
            "national_id": m.national_id,  # ✅ ADD THIS LINE
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
       "sub_stage_operator",  
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

      # ── CHECK SUSPENSION ──
    if getattr(member, "is_suspended", False):
        return jsonify({
            "error": "Your account has been suspended due to disciplinary actions. Please contact HR or Admin to lift your suspension."
        }), 403
    
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
    membership_no = data.get("membership_no", "").strip().upper()
    if not membership_no:
        return jsonify({"error": "Membership number is required"}), 400

    allowed_roles = ["owner", "driver", "conductor", "stage_operator", "hr", "director", "sub_stage_operator", "member"]
    if data.get("role") not in allowed_roles:
        return jsonify({"error": "Invalid role"}), 400

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
        is_active=True
    )
    member.set_password(data["password"])

    db.session.add(member)
    db.session.commit()

    # 🔴 RETURN MEMBER ID HERE
    return jsonify({
        "message": "Member created and activated",
        "id": member.id,
        "member": {
            "id": member.id,
            "membership_no": member.membership_no,
            "name": member.name
        }
    }), 201
# pending members (hr side)
@app.route("/hr/pending-members", methods=["GET"])
def pending_members():
    try:
        # Exclude anyone marked as rejected
        members = Member.query.filter(
            Member.is_active == False,
            db.or_(Member.is_rejected == False, Member.is_rejected.is_(None))
        ).all()
    except Exception:
        members = Member.query.filter_by(is_active=False).all()

    return jsonify([
        {
            "id": m.id,
            "membership_no": m.membership_no,
            "name": m.name,
            "national_id": m.national_id,
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
    m.is_rejected = False
    db.session.commit()
    return jsonify({"message": f"Member {m.name} approved successfully"}), 200
# REJECT MEMBER
# ── REJECT & DELETE MEMBER (Handles members with login activity & foreign keys) ──
@app.route("/hr/reject/<int:id>", methods=["DELETE"])
def reject_member(id):
    m = Member.query.get_or_404(id)
    try:
        # 1. Decouple/clean foreign keys created during login or activity
        Notification.query.filter_by(recipient_id=id).delete()
        LoanGuarantor.query.filter_by(guarantor_id=id).delete()
        WorkerWarning.query.filter_by(member_id=id).delete()
        SalaryPayment.query.filter_by(member_id=id).delete()
        SalaryConfig.query.filter_by(member_id=id).delete()
        Assignment.query.filter_by(member_id=id).delete()

        # Decouple permanent audit logs without breaking audit history
        AuditLogPermanent.query.filter_by(member_id=id).update({AuditLogPermanent.member_id: None})
        AuditLogPermanent.query.filter_by(performed_by_id=id).update({AuditLogPermanent.performed_by_id: None})

        # Remove orphan loan applications or savings
        LoanApplication.query.filter_by(member_id=id).delete()
        LoanRequest.query.filter_by(member_id=id).delete()
        Saving.query.filter_by(member_id=id).delete()
        SaccoPayment.query.filter_by(member_id=id).delete()

        db.session.delete(m)
        db.session.commit()
        return jsonify({"message": f"Member {m.name} rejected and deleted successfully ✓"}), 200

    except Exception as e:
        db.session.rollback()
        # Fallback if DB prevents hard delete: mark as rejected so they disappear from pending list
        m.is_active = False
        m.is_rejected = True
        db.session.commit()
        return jsonify({"message": f"Member {m.name} rejected and removed from pending queue ✓"}), 200


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
            "subsequent_fee": getattr(r, "subsequent_fee", 100.0) or 100.0,
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
    
    subsequent_fee = float(data.get("subsequent_fee") or 100.0)

    if existing and existing.is_active:
        return jsonify({"error": "Route already exists"}), 400
    if existing and not existing.is_active:
        existing.is_active = True
        existing.shimo_fee = float(data["shimo_fee"])
        existing.subsequent_fee = subsequent_fee
        db.session.commit()
        return jsonify({"message": "Route reactivated", "id": existing.id}), 201

    route = Route(
        from_stage=data["from_stage"].strip(),
        to_stage=data["to_stage"].strip(),
        shimo_fee=float(data["shimo_fee"]),
        subsequent_fee=subsequent_fee
    )
    db.session.add(route)
    db.session.commit()
    return jsonify({
        "message": "Route created", 
        "id": route.id,
        "from_stage": route.from_stage, 
        "to_stage": route.to_stage,
        "shimo_fee": route.shimo_fee,
        "subsequent_fee": route.subsequent_fee
    }), 201

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
    if data.get("subsequent_fee") is not None:
        route.subsequent_fee = float(data["subsequent_fee"])
    db.session.commit()
    return jsonify({
        "message": "Route updated", 
        "id": route.id,
        "from_stage": route.from_stage, 
        "to_stage": route.to_stage,
        "shimo_fee": route.shimo_fee,
        "subsequent_fee": route.subsequent_fee
    })

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
# ================= SACCO SETTING HELPERS & ROUTES =================
def get_or_create_sacco_setting():
    setting = SaccoSetting.query.get(1)
    if not setting:
        setting = SaccoSetting(id=1, sacco_name="2KM SACCO")
        db.session.add(setting)
        db.session.commit()
    return setting

@app.route("/settings/sacco", methods=["GET"])
@jwt_required()
def get_sacco_setting():
    setting = get_or_create_sacco_setting()
    return jsonify({
        "sacco_name": setting.sacco_name,
        "location": setting.location,
        "po_box": setting.po_box,
        "phone_number": setting.phone_number
    })

@app.route("/settings/sacco", methods=["PUT"])
@jwt_required()
def update_sacco_setting():
    identity = get_jwt_identity()
    # Restrict write permissions to managers (HR, Admin, Director)
    if identity["role"] not in ["hr", "admin", "director"]:
        return jsonify({"error": "Unauthorized permission level"}), 403
        
    data = request.get_json()
    setting = get_or_create_sacco_setting()
    
    if "sacco_name" in data:
        setting.sacco_name = data["sacco_name"].strip()
    if "location" in data:
        setting.location = data["location"].strip()
    if "po_box" in data:
        setting.po_box = data["po_box"].strip()
    if "phone_number" in data:
        setting.phone_number = data["phone_number"].strip()
        
    db.session.commit()
    return jsonify({"message": "Sacco settings updated successfully"})

def generate_ticket_number():
    date_str = datetime.now().strftime("%Y%m%d")
    random_num = random.randint(1000, 9999)
    return f"TKT-{date_str}-{random_num}"

@app.route("/receipts", methods=["POST"])
@jwt_required()
def create_receipt():
    data = request.get_json()
    ticket_number = generate_ticket_number()
    setting = get_or_create_sacco_setting()
    
    receipt = Receipt(
        ticket_number=ticket_number,
        sacco_name=setting.sacco_name,
        location=setting.location,
        po_box=setting.po_box,
        phone_number=setting.phone_number,
        matatu_id=int(data["matatu_id"]),
        plate=data["plate"].strip().upper(),  # <-- Normalize plate to uppercase
        owner_name=data.get("owner_name", ""),
        route_id=int(data["route_id"]),
        from_stage=data["from_stage"],
        to_stage=data["to_stage"],
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
 
# ================= STAGE SPLITS, SUB-STAGE & ADMIN AUDIT DESK =================
@app.route("/receipts/<int:id>/submit", methods=["PUT"])
@jwt_required()
def submit_receipt(id):
    receipt = Receipt.query.get_or_404(id)
    if receipt.is_submitted:
        return jsonify({"error": "Already submitted"}), 400

    receipt.is_submitted = True

    # Check prior submitted trips with normalized plate
    clean_plate = (receipt.plate or "").strip().upper()
    prior_trips = Receipt.query.filter(
        db.func.upper(db.func.trim(Receipt.plate)) == clean_plate,
        Receipt.date_issued == receipt.date_issued,
        Receipt.is_submitted == True,
        Receipt.id != receipt.id
    ).count()

    if prior_trips == 0 and receipt.shimo_fee >= 200:
        # ── 1ST TRIP BREAKDOWN ──
        matatu = Matatu.query.filter(db.func.upper(db.func.trim(Matatu.plate)) == clean_plate).first()
        owner = Member.query.filter_by(membership_no=matatu.owner_member_no).first() if matatu else None

        if owner:
            owner_saving = Saving(
                member_id=owner.id,
                matatu_id=matatu.id if matatu else None,
                amount=50.0,
                transaction_type="deposit",
                description=f"First Trip Stage Savings — {clean_plate} ({receipt.ticket_number})",
                date=receipt.date_issued
            )
            db.session.add(owner_saving)

        welfare_entry = WelfareLedger(
            type="Inflow",
            recipient_or_source=f"Main Stage Split — {clean_plate}",
            amount=50.0,
            reason=f"Stage Welfare allocation from Ticket {receipt.ticket_number}",
            date=receipt.date_issued
        )
        db.session.add(welfare_entry)

        police_expense = StageExpense(
            matatu_plate=clean_plate,
            type="Police Fee",
            amount=100.0,
            source_account="Main Stage Collection",
            description=f"Police allocation (100 KES) from Ticket {receipt.ticket_number}",
            split_breakdown={"police_fee": 100.0, "welfare_pool": 50.0, "owner_savings": 50.0},
            date=receipt.date_issued,
            is_submitted=True,
            recorded_by=receipt.issued_by
        )
        db.session.add(police_expense)
    else:
        # ── 2ND & SUBSEQUENT TRIPS (100% TO WELFARE) ──
        trip_num = prior_trips + 1
        welfare_subsequent_entry = WelfareLedger(
            type="Inflow",
            recipient_or_source=f"Main Stage trip number {trip_num} — {clean_plate}",
            amount=float(receipt.shimo_fee),
            reason=f"Stage Welfare allocation from Ticket {receipt.ticket_number}",
            date=receipt.date_issued
        )
        db.session.add(welfare_subsequent_entry)

    db.session.commit()
    return jsonify({"message": "Receipt submitted, locked, and automated splits processed ✓"})

# ── SUB-BRANCH STAGE OPERATIONS (100 KES Fixed to Welfare) ──

@app.route("/stage/sub-branch-collect", methods=["POST"])
@jwt_required()
def sub_branch_collect():
    identity = get_jwt_identity()
    data = request.get_json()
    
    plate = data.get("plate", "").strip().upper()
    ticket_no = generate_ticket_number()
    date_issued = data.get("date_issued", datetime.now().strftime("%Y-%m-%d"))

    # 1. Record receipt for tracking
    receipt = Receipt(
        ticket_number=ticket_no,
        plate=plate,
        from_stage=data.get("from_stage", "Sub-Branch Stage"),
        to_stage=data.get("to_stage", "Destination"),
        shimo_fee=100.0,
        route_id=int(data.get("route_id", 1)) if data.get("route_id") else 1,
        matatu_id=int(data.get("matatu_id", 0)) if data.get("matatu_id") else 0,
        mode_of_payment="Cash",
        issued_by=identity["id"],
        operator_membership_no=identity.get("membership_no", ""),
        date_issued=date_issued,
        time_issued=datetime.now().strftime("%H:%M:%S"),
        is_submitted=True
    )
    db.session.add(receipt)

    # 2. 100% of KES 100 to Sub-Branch Welfare Pool
    welfare_txn = WelfareLedger(
        type="Inflow",
        recipient_or_source=f"Sub-Branch Fee ({plate})",
        amount=100.0,
        reason=f"Sub-branch collection — Ticket {ticket_no}",
        date=date_issued
    )
    db.session.add(welfare_txn)
    db.session.commit()

    return jsonify({"message": "Sub-branch collection recorded", "ticket_number": ticket_no, "id": receipt.id}), 201


@app.route("/stage/sub-branch-expense", methods=["POST"])
@jwt_required()
def sub_branch_expense():
    data = request.get_json()
    amount = float(data.get("amount", 0))
    
    expense_txn = WelfareLedger(
        type="Payout",
        recipient_or_source=data.get("recipient", "Sub-Stage Operational Expense"),
        amount=amount,
        reason=data.get("reason", "Sub-branch expense deduction"),
        date=data.get("date", datetime.now().strftime("%Y-%m-%d"))
    )
    db.session.add(expense_txn)
    db.session.commit()
    return jsonify({"message": "Sub-branch expense deducted from welfare pool"}), 201


@app.route("/stage/sub-branch-welfare", methods=["GET"])
@jwt_required()
def get_sub_branch_welfare():
    txns = WelfareLedger.query.order_by(WelfareLedger.created_at.desc()).all()
    balance = sum(t.amount if t.type == "Inflow" else -t.amount for t in txns)
    return jsonify({
        "balance": balance,
        "transactions": [{
            "id": t.id,
            "type": t.type,
            "recipient": t.recipient_or_source,
            "reason": t.reason,
            "amount": t.amount,
            "date": t.date
        } for t in txns]
    })
# ================= POLICE POOL & PAYOUT ROUTES =================
@app.route("/stage/police-pool", methods=["GET"])
@jwt_required()
def get_police_pool():
    # All submitted police fee collections
    inflows = StageExpense.query.filter(
        StageExpense.type == "Police Fee",
        StageExpense.is_submitted == True
    ).all()
    total_collected = sum(e.amount for e in inflows)

    # All disbursements/payouts
    payouts = StageExpense.query.filter(
        StageExpense.type == "Police Clearance Payout",
        StageExpense.is_submitted == True
    ).order_by(StageExpense.created_at.desc()).all()
    total_paid_out = sum(p.amount for p in payouts)

    balance = max(0.0, total_collected - total_paid_out)

    return jsonify({
        "current_balance": balance,
        "total_collected": total_collected,
        "total_paid_out": total_paid_out,
        "payouts": [{
            "id": p.id,
            "amount": p.amount,
            "recipient": p.description,
            "source_account": p.source_account,
            "date": p.date
        } for p in payouts]
    })

@app.route("/stage/police-payout", methods=["POST"])
@jwt_required()
def record_police_payout():
    identity = get_jwt_identity()
    data = request.get_json()
    
    amount = float(data.get("amount", 0))
    if amount <= 0:
        return jsonify({"error": "Invalid payout amount"}), 400

    payout = StageExpense(
        matatu_plate="POLICE-PAYOUT",
        type="Police Clearance Payout",
        amount=amount,
        source_account=data.get("source_account", "Petty Cash Box"),
        description=f"Paid to: {data.get('recipient')} — {data.get('notes', '')}",
        date=data.get("date", datetime.now().strftime("%Y-%m-%d")),
        is_submitted=True,
        recorded_by=identity["id"]
    )
    db.session.add(payout)
    db.session.commit()
    return jsonify({"message": "Police payout processed and deducted from pool", "id": payout.id}), 201

# ── ADMIN STAGE REVIEW & APPROVAL DESK ──

@app.route("/stage/transactions/review", methods=["GET"])
@jwt_required()
def get_stage_transactions_for_review():
    receipts = Receipt.query.filter_by(is_submitted=True).order_by(Receipt.created_at.desc()).all()
    
    records = []
    main_total = 0.0
    sub_total = 0.0
    savings_total = 0.0
    police_total = 0.0

    for r in receipts:
        is_main = r.shimo_fee >= 200
        stage_type = "main" if is_main else "sub_branch"
        
        if is_main:
            main_total += r.shimo_fee
            savings_total += 50.0
            police_total += 100.0
        else:
            sub_total += r.shimo_fee

        records.append({
            "id": r.id,
            "ticket_number": r.ticket_number,
            "date_issued": r.date_issued,
            "plate": r.plate,
            "shimo_fee": r.shimo_fee,
            "stage_type": stage_type,
            "admin_approved": getattr(r, "admin_approved", False)
        })

    return jsonify({
        "stats": {
            "mainTotal": main_total,
            "subTotal": sub_total,
            "savingsTotal": savings_total,
            "policeTotal": police_total
        },
        "records": records
    })


@app.route("/stage/transactions/<int:id>/approve", methods=["PUT"])
@jwt_required()
def approve_stage_transaction(id):
    receipt = Receipt.query.get_or_404(id)
    receipt.admin_approved = True
    db.session.commit()
    return jsonify({"message": f"Transaction for {receipt.plate} approved and verified by Admin ✓"})

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
        "sacco_name": r.sacco_name,
        "location": r.location,
        "po_box": r.po_box,
        "phone_number": r.phone_number
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
        "operator_membership_no": r.operator_membership_no,
        "sacco_name": r.sacco_name,
        "location": r.location,
        "po_box": r.po_box,
        "phone_number": r.phone_number
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
        "time_issued": r.time_issued, "operator_membership_no": r.operator_membership_no,
        "sacco_name": r.sacco_name,
        "location": r.location,
        "po_box": r.po_box,
        "phone_number": r.phone_number
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
# 2. Upgrade deposit endpoint to support proofs & queue as pending_hr
@app.route("/savings/deposit", methods=["POST"])
@jwt_required()
def deposit_saving():
    identity = get_jwt_identity()
    role = identity["role"]
    
    if role in ["hr", "admin", "director"]:
        return jsonify({"error": "HR and Admins cannot submit personal deposits on this route"}), 403

    proof_file = None
    if "proof_file" in request.files:
        file = request.files["proof_file"]
        file_type = file.content_type or ""
        upload = cloudinary.uploader.upload(file, resource_type="raw" if "image" not in file_type else "image")
        proof_file = upload["secure_url"]

    raw_matatu = request.form.get("matatu_id")
    matatu_id = int(raw_matatu) if raw_matatu and str(raw_matatu).strip() != "null" and str(raw_matatu).strip() else None

    saving = Saving(
        member_id=identity["id"],
        matatu_id=matatu_id,
        amount=float(request.form.get("amount")),
        transaction_type="deposit",
        description=request.form.get("description", "Deposit"),
        date=request.form.get("date"),
        payment_method=request.form.get("payment_method", "cash"),
        mpesa_code=request.form.get("mpesa_code", ""),
        proof_file=proof_file,
        status="pending_hr"  # First tier: Awaiting HR verification
    )

    db.session.add(saving)
    db.session.commit()
    return jsonify({"message": "Deposit lodged. Sent to HR queue for verification.", "id": saving.id}), 201

# 3. HR/Admin manually logs saving for a member (Forces status to pending_admin)
@app.route("/savings/hr-add", methods=["POST"])
@jwt_required()
def hr_add_saving():
    identity = get_jwt_identity()
    if identity["role"] not in ["hr", "admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    proof_file = None
    if "proof_file" in request.files:
        file = request.files["proof_file"]
        file_type = file.content_type or ""
        upload = cloudinary.uploader.upload(file, resource_type="raw" if "image" not in file_type else "image")
        proof_file = upload["secure_url"]
    else:
        return jsonify({"error": "Proof of payment document is strictly mandatory for manual overrides"}), 400
        
    member_id = int(request.form.get("member_id"))
    amount = float(request.form.get("amount"))
    raw_matatu = request.form.get("matatu_id")
    matatu_id = int(raw_matatu) if raw_matatu and str(raw_matatu).strip() != "null" and str(raw_matatu).strip() else None
    payment_method = request.form.get("payment_method")
    mpesa_code = request.form.get("mpesa_code", "")
    description = request.form.get("description", "Administrative manual entry")
    date_val = request.form.get("date") or datetime.utcnow().strftime("%Y-%m-%d")
    
    saving = Saving(
        member_id=member_id,
        matatu_id=matatu_id,
        amount=amount,
        transaction_type="deposit",
        description=description,
        date=date_val,
        payment_method=payment_method,
        mpesa_code=mpesa_code,
        proof_file=proof_file,
        status="pending_admin" # HR manual inputs bypass HR verification but require Admin final approval
    )
    db.session.add(saving)
    
    member = Member.query.get(member_id)
    log = AuditLogPermanent(
        action="SAVING_ADMIN_MANUAL_LOGGED",
        category="member",
        member_id=member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Manually logged KES {amount} via {payment_method}. Ref: {mpesa_code}. Awaiting Admin sign-off."
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Manual saving request recorded. Awaiting Admin final sign-off.", "id": saving.id}), 201


# 4. HR Prompts a member to make a savings deposit
@app.route("/savings/prompt", methods=["POST"])
@jwt_required()
def prompt_member_saving():
    identity = get_jwt_identity()
    if identity["role"] not in ["hr", "admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    data = request.get_json()
    member_id = int(data.get("member_id"))
    message = data.get("message", "Dear member, please remember to update and deposit your regular savings/shares to maintain your loan eligibility limit.")
    
    # Send Notification in-system
    note = Notification(
        recipient_id=member_id,
        sender_name="HR Operations",
        type="saving",
        title="Savings Contribution Reminder",
        message=message
    )
    db.session.add(note)
    
    member = Member.query.get(member_id)
    log = AuditLogPermanent(
        action="SAVING_PROMPT_SENT",
        category="worker",
        member_id=member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Prompt sent: {message}"
    )
    db.session.add(log)
    db.session.commit()
    
    # Optional SMS Integration using AT
    if member and member.phone and sms:
        try:
            sms.send(message, [member.phone])
        except Exception as e:
            print("AT SMS Prompt failed:", e)
            
    return jsonify({"message": "Prompt dispatched successfully"})

# 5. Get Pending Savings for approvals
@app.route("/savings/pending", methods=["GET"])
@jwt_required()
def get_pending_savings():
    identity = get_jwt_identity()
    role = identity["role"]
    
    if role not in ["hr", "admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    if role == "hr":
        pending_list = Saving.query.filter_by(status="pending_hr").all()
    else:
        pending_list = Saving.query.filter(Saving.status.in_(["pending_hr", "pending_admin"])).all()
        
    result = []
    for s in pending_list:
        member = Member.query.get(s.member_id)
        result.append({
            "id": s.id,
            "member_id": s.member_id,
            "member_name": member.name if member else "Unknown Member",
            "membership_no": member.membership_no if member else "",
            "amount": s.amount,
            "transaction_type": s.transaction_type,
            "description": s.description,
            "date": s.date,
            "matatu_id": s.matatu_id,
            "status": s.status,
            "payment_method": s.payment_method,
            "mpesa_code": s.mpesa_code,
            "proof_file": s.proof_file
        })
    return jsonify(result)

# 5. HR first approval: Promotes pending_hr to pending_admin
@app.route("/savings/<int:id>/hr-recommend", methods=["PUT"])
@jwt_required()
def hr_recommend_saving(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["hr", "admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    saving = Saving.query.get_or_404(id)
    if saving.status != "pending_hr":
        return jsonify({"error": "Can only recommend items with status 'pending_hr'"}), 400
        
    saving.status = "pending_admin"
    
    member = Member.query.get(saving.member_id)
    log = AuditLogPermanent(
        action="SAVING_HR_RECOMMENDED",
        category="member",
        member_id=saving.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"HR verified first tier for deposit KES {saving.amount}. Forwarded to Admin."
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Savings recommended and forwarded for final Admin sign-off ✓"})

# 6. Admin final approval: Promotes status to approved (Active balances update)
@app.route("/savings/<int:id>/admin-approve", methods=["PUT"])
@jwt_required()
def admin_final_approve_saving(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director"]:
        return jsonify({"error": "Only Administrators or Directors can grant final savings approvals"}), 403
        
    saving = Saving.query.get_or_404(id)
    if saving.status != "pending_admin":
        return jsonify({"error": "Can only approve items recommended or created in status 'pending_admin'"}), 400
        
    saving.status = "approved"
    
    db.session.add(Notification(
        recipient_id=saving.member_id,
        sender_name="Sacco Admin Desk",
        type="saving",
        title="Savings Deposit Confirmed! ✅",
        message=f"Admin has confirmed your contribution of KES {saving.amount:,.0f}. Funds have been credited to your active Sacco balance."
    ))
    
    member = Member.query.get(saving.member_id)
    log = AuditLogPermanent(
        action="SAVING_ADMIN_APPROVED",
        category="member",
        member_id=saving.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Admin granted final savings sign-off of KES {saving.amount} for Member ID {saving.member_id}."
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Savings contribution approved and successfully credited ✓"})

# 6. Approve savings contribution (Credits active balance)
@app.route("/savings/<int:id>/approve", methods=["PUT"])
@jwt_required()
def approve_saving_transaction(id):
    identity = get_jwt_identity()
    saving = Saving.query.get_or_404(id)
    
    if identity["role"] == "hr" and saving.status != "pending_hr":
        return jsonify({"error": "HR can only authorize standard member contributions"}), 403
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    saving.status = "approved"
    
    db.session.add(Notification(
        recipient_id=saving.member_id,
        sender_name="SACCO Management",
        type="saving",
        title="Savings Contribution Approved! ✅",
        message=f"Your deposit of KES {saving.amount:,.0f} has been verified and successfully credited."
    ))
    
    member = Member.query.get(saving.member_id)
    log = AuditLogPermanent(
        action="SAVING_TRANSACTION_APPROVED",
        category="member",
        member_id=saving.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Approved savings of KES {saving.amount} for Member: {member.name if member else 'N/A'}"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Savings contribution approved and credited successfully ✓"})

# 7. Reject savings transaction
@app.route("/savings/<int:id>/reject", methods=["PUT"])
@jwt_required()
def reject_saving_transaction(id):
    identity = get_jwt_identity()
    saving = Saving.query.get_or_404(id)
    
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    saving.status = "rejected"
    
    db.session.add(Notification(
        recipient_id=saving.member_id,
        sender_name="SACCO Management",
        type="saving",
        title="Savings Deposit Rejected ❌",
        message=f"Your deposit request of KES {saving.amount:,.0f} has been rejected due to invalid transaction details."
    ))
    
    member = Member.query.get(saving.member_id)
    log = AuditLogPermanent(
        action="SAVING_TRANSACTION_REJECTED",
        category="member",
        member_id=saving.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Rejected savings contribution of KES {saving.amount} for Member ID {saving.member_id}"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Savings contribution rejected"})

# 9. Admin view to audit matatu savings
@app.route("/admin/matatu-savings", methods=["GET"])
@jwt_required()
def admin_matatu_savings():
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    savings = Saving.query.filter(Saving.matatu_id.isnot(None)).order_by(Saving.created_at.desc()).all()
    result = []
    for s in savings:
        member = Member.query.get(s.member_id)
        matatu = Matatu.query.get(s.matatu_id)
        result.append({
            "id": s.id,
            "plate": matatu.plate if matatu else "N/A",
            "amount": s.amount,
            "transaction_type": s.transaction_type,
            "description": s.description,
            "payment_method": s.payment_method,
            "mpesa_code": s.mpesa_code,
            "date": s.date,
            "status": s.status,
            "submitted_by": f"{member.name} ({member.role})" if member else "N/A"
        })
    return jsonify(result)

# 8. Report API Engine (Filtered weekly, monthly, yearly analytics)
@app.route("/savings/reports", methods=["GET"])
@jwt_required()
def get_savings_reports():
    identity = get_jwt_identity()
    period = request.args.get("period", "monthly") # 'weekly' | 'monthly' | 'yearly'
    member_id = request.args.get("member_id")
    matatu_id = request.args.get("matatu_id")
    
    # General users can only query their own report histories
    if identity["role"] not in ["hr", "admin", "director"]:
        member_id = identity["id"]

    query = Saving.query.filter_by(status="approved")
    if member_id:
        query = query.filter_by(member_id=int(member_id))
    if matatu_id:
        query = query.filter_by(matatu_id=int(matatu_id))
        
    savings = query.order_by(Saving.date.desc()).all()
    now = datetime.utcnow()
    
    filtered_savings = []
    for s in savings:
        try:
            s_date = datetime.strptime(s.date, "%Y-%m-%d")
        except ValueError:
            continue
            
        if period == "weekly":
            # Current calendar week (last 7 days)
            if now - s_date <= timedelta(days=7):
                filtered_savings.append(s)
        elif period == "monthly":
            # Current calendar month
            if s_date.year == now.year and s_date.month == now.month:
                filtered_savings.append(s)
        elif period == "yearly":
            # Current calendar year
            if s_date.year == now.year:
                filtered_savings.append(s)
                
    total_deposits = sum(f.amount for f in filtered_savings if f.transaction_type == "deposit")
    total_withdrawals = sum(f.amount for f in filtered_savings if f.transaction_type == "withdrawal")
    
    return jsonify({
        "period": period,
        "total_deposits": total_deposits,
        "total_withdrawals": total_withdrawals,
        "net_savings": total_deposits - total_withdrawals,
        "transactions": [{
            "id": f.id,
            "amount": f.amount,
            "transaction_type": f.transaction_type,
            "description": f.description,
            "payment_method": f.payment_method,
            "mpesa_code": f.mpesa_code,
            "date": f.date,
            "member_id": f.member_id,
            "matatu_id": f.matatu_id
        } for f in filtered_savings]
    })


# 1. Update Personal & Matatu savings balances to ONLY sum "approved" transactions
@app.route("/savings/my", methods=["GET"])
@jwt_required()
def get_my_savings():
    identity = get_jwt_identity()
    savings = Saving.query.filter_by(
        member_id=identity["id"]
    ).order_by(Saving.created_at.desc()).all()

    approved_savings = [s for s in savings if getattr(s, "status", "approved") == "approved"]
    total = sum(
        s.amount if s.transaction_type == "deposit" else -s.amount
        for s in approved_savings
    )

    return jsonify({
        "balance": total,
        "transactions": [{
            "id": s.id,
            "amount": s.amount,
            "transaction_type": s.transaction_type,
            "description": s.description,
            "date": s.date,
            "matatu_id": s.matatu_id,
            "status": getattr(s, "status", "approved"),
            "payment_method": getattr(s, "payment_method", "cash"),
            "mpesa_code": getattr(s, "mpesa_code", ""),
            "proof_file": getattr(s, "proof_file", None)
        } for s in savings]
    })

@app.route("/savings/matatu/<int:matatu_id>", methods=["GET"])
@jwt_required()
def get_matatu_savings(matatu_id):
    savings = Saving.query.filter_by(matatu_id=matatu_id).all()
    approved_savings = [s for s in savings if getattr(s, "status", "approved") == "approved"]
    total = sum(
        s.amount if s.transaction_type == "deposit" else -s.amount
        for s in approved_savings
    )
    return jsonify({
        "balance": total,
        "transactions": [{
            "id": s.id,
            "amount": s.amount,
            "transaction_type": s.transaction_type,
            "description": s.description,
            "date": s.date,
            "status": getattr(s, "status", "approved"),
            "payment_method": getattr(s, "payment_method", "cash"),
            "mpesa_code": getattr(s, "mpesa_code", ""),
            "proof_file": getattr(s, "proof_file", None)
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
# ================= ADMIN: GET DEACTIVATED LOAN TYPES =================
@app.route("/loan-types/deactivated", methods=["GET"])
@jwt_required()
def get_deactivated_loan_types():
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized access level"}), 403
        
    types = LoanType.query.filter_by(is_active=False).all()
    return jsonify([{
        "id": t.id, 
        "name": t.name, 
        "interest_rate": t.interest_rate,
        "max_amount": t.max_amount, 
        "min_amount": t.min_amount,
        "max_months": t.max_months, 
        "min_months": t.min_months,
        "description": t.description,
        "terms_file": getattr(t, "terms_file", None),
        "repayment_frequency": getattr(t, "repayment_frequency", "monthly"),
        "repayment_start_rule": getattr(t, "repayment_start_rule", "next_period"),
        "penalty_type": getattr(t, "penalty_type", "percentage"),
        "penalty_amount": getattr(t, "penalty_amount", 5.0),
        "penalty_frequency": getattr(t, "penalty_frequency", "monthly"),
        "penalty_rate": getattr(t, "penalty_rate", 5.0),
        "grace_period_days": getattr(t, "grace_period_days", 3),
        "penalty_description": getattr(t, "penalty_description", "")
    } for t in types]), 200

# ================= ADMIN: REACTIVATE LOAN TYPE =================
@app.route("/loan-types/<int:id>/reactivate", methods=["PUT"])
@jwt_required()
def reactivate_loan_type(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized access level"}), 403
        
    lt = LoanType.query.get_or_404(id)
    if lt.is_active:
        return jsonify({"error": "This loan type is already active"}), 400
        
    lt.is_active = True
    
    log = AuditLogPermanent(
        action="LOAN_TYPE_REACTIVATED",
        category="loan",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Reactivated Loan Type '{lt.name}' (ID: {id})"
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({"message": f"Loan type '{lt.name}' has been successfully reactivated."}), 200

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

# 2. HR ADD EXISTING LOAN (Updated to accept received_date & repayment start_date)
@app.route("/hr/existing-loan", methods=["POST"])
@jwt_required()
def hr_add_existing_loan():
    identity = get_jwt_identity()
    data = request.get_json()

    member = Member.query.get_or_404(data["member_id"])
    loan_type = LoanType.query.get_or_404(data["loan_type_id"])

    amount = float(data["amount"])
    interest_rate = float(data.get("interest_rate") or loan_type.interest_rate)
    months = int(data.get("repayment_months") or 1)
    amount_repaid = float(data.get("amount_repaid") or 0)
    status = data.get("status", "repaying")
    if status not in ["disbursed", "repaying", "cleared"]:
        return jsonify({"error": "Invalid status for an existing loan"}), 400

    total_interest = (amount * interest_rate / 100) * (months / 12)
    total_payable = round(amount + total_interest, 2)
    monthly_installment = round(total_payable / months, 2) if months else 0

    received_date_str = data.get("received_date") or datetime.utcnow().strftime("%Y-%m-%d")
    start_date_str = data.get("start_date") or datetime.utcnow().strftime("%Y-%m-%d")

    try:
        received_dt = datetime.strptime(received_date_str, "%Y-%m-%d")
    except Exception:
        received_dt = datetime.utcnow()

    loan = LoanApplication(
        member_id=member.id,
        loan_type_id=loan_type.id,
        amount=amount,
        interest_rate=interest_rate,
        repayment_months=months,
        monthly_installment=monthly_installment,
        total_payable=total_payable,
        purpose=data.get("purpose", "Existing loan onboarded by HR"),
        status=status,
        amount_repaid=amount_repaid,
        approved_by=identity["id"],
        approved_at=received_dt,
        created_at=received_dt
    )
    db.session.add(loan)
    db.session.commit()

    # Build repayment schedule based on Repayment Start Date
    try:
        from dateutil.relativedelta import relativedelta
        start = datetime.strptime(start_date_str, "%Y-%m-%d")
        remaining = amount_repaid
        for i in range(1, months + 1):
            due = start + relativedelta(months=i-1)
            sched = LoanRepaymentSchedule(
                loan_id=loan.id, 
                installment_no=i,
                due_date=due.strftime("%Y-%m-%d"),
                amount_due=monthly_installment,
            )
            if remaining >= monthly_installment:
                sched.status = "paid"
                sched.amount_paid = monthly_installment
                remaining -= monthly_installment
            elif remaining > 0:
                sched.amount_paid = remaining
                remaining = 0
            db.session.add(sched)
    except Exception as e:
        print("Schedule error:", e)

    log = LoanAuditLog(
        loan_id=loan.id, 
        action="EXISTING_LOAN_ONBOARDED",
        performed_by=identity["id"], 
        notes=f"Onboarded by HR: {identity['name']} | Received: {received_date_str} | Repay Start: {start_date_str}"
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({"message": "Existing loan recorded", "id": loan.id}), 201

# ================= SACCO PAYMENTS =================

# 1. Update Payment Creation to start as pending
# 1. Update Payment Creation to start as pending
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
        notes=request.form.get("notes", ""),
        status="pending"  # <-- Set default status to pending
    )
    db.session.add(payment)
    db.session.commit()
    return jsonify({"message": "Payment recorded, awaiting admin approval", "id": payment.id}), 201

# 2. Update Member view to return status safely
@app.route("/sacco-payments/my", methods=["GET"])
@jwt_required()
def get_my_sacco_payments():
    identity = get_jwt_identity()
    payments = SaccoPayment.query.filter_by(member_id=identity["id"]).order_by(SaccoPayment.created_at.desc()).all()
    return jsonify([{
        "id": p.id, 
        "payment_type": p.payment_type, 
        "amount": p.amount,
        "matatu_id": p.matatu_id, 
        "proof_file": p.proof_file,
        "date": p.date, 
        "notes": p.notes,
        "status": getattr(p, "status", "approved") or "approved" # fallback support for legacy rows
    } for p in payments])

# 3. Update Admin Global list to return status safely
# 3. Update Admin Global list to return status safely
@app.route("/sacco-payments/all", methods=["GET"])
@jwt_required()
def get_all_sacco_payments():
    payments = SaccoPayment.query.order_by(SaccoPayment.created_at.desc()).all()
    result = []
    for p in payments:
        member = Member.query.get(p.member_id)
        result.append({
            "id": p.id, 
            "payment_type": p.payment_type, 
            "amount": p.amount,
            "matatu_id": p.matatu_id, 
            "proof_file": p.proof_file, 
            "date": p.date,
            "notes": p.notes, 
            "member_name": member.name if member else "",
            "membership_no": member.membership_no if member else "",
            "status": getattr(p, "status", "approved") or "approved" # fallback support for legacy rows
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
# 4. Admin Approvals Endpoint
# 4. Admin Approvals Endpoint
@app.route("/sacco-payments/<int:id>/approve", methods=["PUT"])
@jwt_required()
def approve_sacco_payment(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    payment = SaccoPayment.query.get_or_404(id)
    payment.status = "approved"
    
    # Audit log entry
    member = Member.query.get(payment.member_id)
    log = AuditLogPermanent(
        action="SACCO_PAYMENT_APPROVED",
        category="general",
        member_id=payment.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Approved KES {payment.amount:,.2f} SACCO payment ({payment.payment_type})"
    )
    db.session.add(log)
    
    # Notify borrower
    db.session.add(Notification(
        recipient_id=payment.member_id,
        sender_name="Sacco Admin",
        type="general",
        title="SACCO Payment Approved! ✅",
        message=f"Your Sacco Payment of KES {payment.amount:,.2f} for '{payment.payment_type}' has been verified and approved."
    ))
    
    db.session.commit()
    return jsonify({"message": "Sacco payment approved successfully ✓"})

# 5. Admin Rejection Endpoint
@app.route("/sacco-payments/<int:id>/reject", methods=["PUT"])
@jwt_required()
def reject_sacco_payment(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    payment = SaccoPayment.query.get_or_404(id)
    payment.status = "rejected"
    
    # Audit log entry
    member = Member.query.get(payment.member_id)
    log = AuditLogPermanent(
        action="SACCO_PAYMENT_REJECTED",
        category="general",
        member_id=payment.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Rejected KES {payment.amount:,.2f} SACCO payment ({payment.payment_type})"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Sacco payment rejected"})
# ================= LOAN TYPES (HR manages) =================
@app.route("/loan-types", methods=["GET"])
def get_loan_types():
    types = LoanType.query.filter_by(is_active=True).all()
    return jsonify([{
        "id": t.id, 
        "name": t.name, 
        "interest_rate": t.interest_rate,
        "max_amount": t.max_amount, 
        "min_amount": t.min_amount,
        "max_months": t.max_months, 
        "min_months": t.min_months,
        "description": t.description,
        "terms_file": getattr(t, "terms_file", None),
        "repayment_frequency": getattr(t, "repayment_frequency", "monthly"),
        "repayment_start_rule": getattr(t, "repayment_start_rule", "next_period"),
        "penalty_type": getattr(t, "penalty_type", "percentage"),
        "penalty_amount": getattr(t, "penalty_amount", 5.0),
        "penalty_frequency": getattr(t, "penalty_frequency", "monthly"),
        "penalty_rate": getattr(t, "penalty_rate", 5.0),
        "grace_period_days": getattr(t, "grace_period_days", 3),
        "penalty_description": getattr(t, "penalty_description", "")
    } for t in types])

@app.route("/loan-types", methods=["POST"])
@jwt_required()
def create_loan_type():
    data = request.get_json()
    lt = LoanType(
        name=data["name"], 
        interest_rate=float(data["interest_rate"]),
        max_amount=float(data["max_amount"]), 
        min_amount=float(data["min_amount"]),
        max_months=int(data["max_months"]), 
        min_months=int(data["min_months"]),
        description=data.get("description", "")
    )
    # Safely apply the advanced rule configurations
    lt.repayment_frequency = data.get("repayment_frequency", "monthly")
    lt.repayment_start_rule = data.get("repayment_start_rule", "next_period")
    lt.penalty_type = data.get("penalty_type", "percentage")
    lt.penalty_amount = float(data.get("penalty_amount", 5.0))
    lt.penalty_frequency = data.get("penalty_frequency", "monthly")
    lt.grace_period_days = int(data.get("grace_period_days", 3))
    lt.penalty_description = data.get("penalty_description", "")

    db.session.add(lt)
    db.session.commit()
    return jsonify({"message": "Loan type created successfully", "id": lt.id}), 201


# ================= UPDATE LOAN TYPE & NOTIFY BORROWERS =================
@app.route("/loan-types/<int:id>", methods=["PUT"])
@jwt_required()
def update_loan_type(id):
    identity = get_jwt_identity()
    lt = LoanType.query.get_or_404(id)
    data = request.get_json()
    
    old_rate = lt.interest_rate
    new_rate = float(data.get("interest_rate", old_rate))
    rate_changed = old_rate != new_rate

    # Update loan type parameters
    for k in ["name", "min_amount", "max_amount", "min_months", "max_months", "description", "is_active", "repayment_frequency", "repayment_start_rule", "penalty_type", "penalty_amount", "grace_period_days"]:
        if k in data:
            setattr(lt, k, data[k])
    lt.interest_rate = new_rate
    db.session.commit()

    # If rate or terms changed, alert all active borrowers under this loan type
    active_loans = LoanApplication.query.filter(
        LoanApplication.loan_type_id == id,
        LoanApplication.status.in_(["pending", "approved", "disbursed", "repaying"])
    ).all()

    for loan in active_loans:
        if rate_changed:
            loan.rate_change_pending = True
            loan.rate_commitment_status = "pending_borrower"
            loan.rate_change_notes = f"Interest rate revised from {old_rate}% to {new_rate}% p.a."

        # Dispatch in-app notification
        msg = f"The terms/rules for your '{lt.name}' loan have been updated by administration."
        if rate_changed:
            msg += f" Interest rate has been updated to {new_rate}%. Please review and submit your commitment approval."
        
        note = Notification(
            recipient_id=loan.member_id,
            sender_name="SACCO Management",
            type="loan",
            title="Loan Policy & Terms Updated",
            message=msg
        )
        db.session.add(note)

    db.session.commit()
    return jsonify({"message": f"Loan type updated and {len(active_loans)} borrowers notified."})
# ================= BORROWER COMMITMENT (AGREE / DISAGREE) =================
@app.route("/loan-applications/<int:id>/commitment", methods=["PUT"])
@jwt_required()
def borrower_loan_commitment(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    if loan.member_id != identity["id"]:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    status = data.get("status")  # 'agreed' or 'disagreed'
    reason = data.get("reason", "")

    loan.rate_commitment_status = status
    loan.rate_change_pending = False
    
    # Permanent audit record
    log = AuditLogPermanent(
        action=f"BORROWER_RATE_COMMITMENT_{status.upper()}",
        category="loan",
        member_id=identity["id"],
        membership_no=identity["membership_no"],
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Borrower {status} to updated rate adjustments. Reason/Notes: {reason}"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": f"Commitment '{status}' recorded successfully and sent to HR/Admin."})

# ================= TWO-TIER APPROVAL (HR -> ADMIN) =================
@app.route("/loan-applications/<int:id>/hr-recommend", methods=["PUT"])
@jwt_required()
def hr_recommend_loan(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    data = request.get_json() or {}
    loan.status = "hr_approved"
    loan.hr_approved = True
    loan.hr_approved_at = datetime.utcnow()
    loan.admin_notes = data.get("notes", "Recommended by HR")

    log = AuditLogPermanent(
        action="LOAN_HR_APPROVED",
        category="loan",
        member_id=loan.member_id,
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Loan #{id} recommended by HR. Awaiting final Admin approval and disbursement."
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Loan recommended by HR. Sent to Admin for final authorization."})

@app.route("/loan-applications/<int:id>/admin-final-approve", methods=["PUT"])
@jwt_required()
def admin_final_approve(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director"]:
        return jsonify({"error": "Only Admin or Director can grant final approval and disbursement."}), 403

    loan = LoanApplication.query.get_or_404(id)
    loan.admin_approved = True
    loan.status = "disbursed"
    loan.approved_by = identity["id"]
    loan.approved_at = datetime.utcnow()

    # Generate schedules upon disbursement
    loan_type = LoanType.query.get(loan.loan_type_id)
    freq = getattr(loan_type, "repayment_frequency", "monthly")
    start_rule = getattr(loan_type, "repayment_start_rule", "next_period")
    start_date = datetime.utcnow()

    for i in range(1, loan.repayment_months + 1):
        step = i - 1 if start_rule == "same_day" else i
        if freq == "daily":
            due_date = start_date + timedelta(days=step)
        elif freq == "weekly":
            due_date = start_date + timedelta(weeks=step)
        else:
            try:
                from dateutil.relativedelta import relativedelta
                due_date = start_date + relativedelta(months=step)
            except ImportError:
                due_date = start_date + timedelta(days=step * 30)

        db.session.add(LoanRepaymentSchedule(
            loan_id=loan.id,
            installment_no=i,
            due_date=due_date.strftime("%Y-%m-%d"),
            amount_due=loan.monthly_installment
        ))

    # Send Notification to Borrower
    db.session.add(Notification(
        recipient_id=loan.member_id,
        sender_name="SACCO Management",
        type="loan",
        title="Loan Disbursed! ✅",
        message=f"Your loan request of KES {loan.amount:,.0f} has received final Admin authorization and has been disbursed."
    ))

    # --- BOOKKEEPING HOOK A: DISBURSEMENT RECORD ---
    # FIX: Changed loan.loan_type to loan_type.name
    record_ledger_entry(
        loan_id=loan.id,
        member_id=loan.member_id,
        transaction_type="disbursement",
        debit_code="1300",
        debit_name="Loans Receivable Control (Asset)",
        credit_code="1200",
        credit_name="Sacco Cash/Bank Account (Asset)",
        amount=loan.amount,
        description=f"Disbursement of {loan_type.name if loan_type else 'Standard'} Loan #{loan.id}",
        date=datetime.utcnow().strftime("%Y-%m-%d")
    )

    db.session.commit()
    return jsonify({"message": "Final approval complete. Loan disbursed and schedule activated."})

# ================= DEACTIVATION (ADMIN SOFT-DELETE) =================
@app.route("/loan-applications/<int:id>/deactivate", methods=["PUT"])
@jwt_required()
def deactivate_loan(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json() or {}
    loan = LoanApplication.query.get_or_404(id)
    loan.is_active = False
    loan.status = "deactivated"
    loan.deactivation_reason = data.get("reason", "Deactivated / declared null and void by management")

    log = AuditLogPermanent(
        action="LOAN_DEACTIVATED",
        category="loan",
        member_id=loan.member_id,
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Loan #{id} deactivated. Reason: {loan.deactivation_reason}"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": f"Loan #{id} has been deactivated and archived."})

# ================= BORROWER RESPOND TO INFO REQUEST (WITH FILE) =================
@app.route("/loan-applications/<int:id>/respond-info", methods=["PUT"])
@jwt_required()
def respond_info_with_upload(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    if loan.member_id != identity["id"]:
        return jsonify({"error": "Unauthorized"}), 403

    doc_url = None
    if "doc" in request.files:
        file = request.files["doc"]
        file_type = file.content_type or ""
        upload = cloudinary.uploader.upload(file, resource_type="image" if "image" in file_type else "raw")
        doc_url = upload["secure_url"]

    loan.borrower_response = request.form.get("response", "")
    if doc_url:
        loan.borrower_doc = doc_url
    loan.status = "pending"  # Re-queue for HR evaluation

    log = LoanAuditLog(
        loan_id=id,
        action="BORROWER_DOC_INFO_SUBMITTED",
        performed_by=identity["id"],
        notes=f"Response: {loan.borrower_response} | Attached Doc: {doc_url or 'None'}"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Document & response uploaded. Loan re-queued for evaluation."})
# ================= PENALTY CLEARANCE & APPROVAL =================
# ================= MEMBER: SUBMIT SEPARATE PENALTY CLEARANCE =================
@app.route("/loan-applications/<int:id>/pay-penalty", methods=["POST"])
@jwt_required()
def submit_penalty_payment(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    
    if loan.member_id != identity["id"]:
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    amount = float(data.get("amount", 0))

    if amount <= 0:
        return jsonify({"error": "Invalid payment amount"}), 400

    loan.penalty_paid = (loan.penalty_paid or 0) + amount
    loan.penalty_status = "pending_approval"
    
    # Track the transaction details inside audit log
    log = LoanAuditLog(
        loan_id=id,
        action="PENALTY_SUBMISSION",
        performed_by=identity["id"],
        notes=f"Submitted KES {amount:,.2f} penalty payment via {data.get('payment_method', 'mpesa')}. Code: {data.get('mpesa_code', 'N/A')}"
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({
        "message": "Penalty payment submitted successfully. Awaiting Admin confirmation.",
        "penalty_paid": loan.penalty_paid,
        "penalty_status": loan.penalty_status
    }), 200
# 1. Standalone helper function (no decorators)
def record_ledger_entry(*args, **kwargs):
    """
    Safely writes double-entry bookkeeping transactions to the LoanLedgerEntry model.
    Supports both positional and flexible keyword mappings.
    """
    # Map values to LoanLedgerEntry fields
    loan_id = kwargs.get("loan_id") or (args[0] if len(args) > 0 else None)
    member_id = kwargs.get("member_id") or (args[1] if len(args) > 1 else None)
    tx_type = kwargs.get("transaction_type") or (args[2] if len(args) > 2 else "repayment")
    
    debit_code = kwargs.get("debit_code") or kwargs.get("debit_account_code") or (args[3] if len(args) > 3 else "1200")
    debit_name = kwargs.get("debit_name") or kwargs.get("debit_account_name") or (args[4] if len(args) > 4 else "Cash")
    
    credit_code = kwargs.get("credit_code") or kwargs.get("credit_account_code") or (args[5] if len(args) > 5 else "1300")
    credit_name = kwargs.get("credit_name") or kwargs.get("credit_account_name") or (args[6] if len(args) > 6 else "Receivables")
    
    amount = kwargs.get("amount") or (args[7] if len(args) > 7 else 0.0)
    desc = kwargs.get("description") or (args[8] if len(args) > 8 else "")
    date_str = kwargs.get("date") or (args[9] if len(args) > 9 else datetime.utcnow().strftime("%Y-%m-%d"))

    entry = LoanLedgerEntry(
        loan_id=loan_id,
        member_id=member_id,
        transaction_type=tx_type,
        debit_account_code=debit_code,
        debit_account_name=debit_name,
        credit_account_code=credit_code,
        credit_account_name=credit_name,
        amount=float(amount),
        description=desc,
        date=date_str
    )
    db.session.add(entry)
    db.session.commit()
    return entry


# 2. Correctly decorated Flask View function
@app.route("/loan-applications/<int:id>/approve-penalty", methods=["PUT"])
@jwt_required()
def approve_penalty_clearance(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    loan = LoanApplication.query.get_or_404(id)
    if loan.penalty_status != "pending_approval":
        return jsonify({"error": "No pending penalty payment found for this loan"}), 400
        
    # Deduct cleared penalty amount from total penalty and total payable
    loan.penalty = max(0.0, (loan.penalty or 0) - (loan.penalty_paid or 0))
    loan.total_payable = max(0.0, loan.total_payable - loan.penalty_paid)
            
    # --- BOOKKEEPING HOOK D: PENALTY CLEARANCE ---
    record_ledger_entry(
        loan_id=loan.id,
        member_id=loan.member_id,
        transaction_type="penalty_payment",
        debit_code="1200",
        debit_name="Sacco Cash/Bank Account (Asset)",
        credit_code="1350",
        credit_name="Penalties Receivable (Asset)",
        amount=loan.penalty_paid,
        description=f"Approved penalty clearance payment of KES {loan.penalty_paid:,.2f} for Loan #{loan.id}",
        date=datetime.utcnow().strftime("%Y-%m-%d")
    )

    # Audit log entry for the approved amount
    log_audit = AuditLogPermanent(
        action="LOAN_PENALTY_APPROVED",
        category="loan",
        member_id=loan.member_id,
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Approved KES {loan.penalty_paid:,.2f} penalty payment for Loan #{id}"
    )
    db.session.add(log_audit)
    
    # Reset tracking flags
    loan.penalty_paid = 0.0
    loan.penalty_status = "cleared" if loan.penalty == 0 else "none"
    
    # Re-enable regular repayment state if not defaulted elsewhere
    if loan.status == "defaulted" and loan.penalty == 0:
        loan.status = "repaying"

    db.session.commit()
    return jsonify({"message": "Penalty payment approved. Normal repayments are now unblocked.", "status": loan.status}), 200

# ================= ADMIN: REJECT PENALTY CLEARANCE =================
@app.route("/loan-applications/<int:id>/reject-penalty", methods=["PUT"])
@jwt_required()
def reject_penalty_clearance(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    loan = LoanApplication.query.get_or_404(id)
    if loan.penalty_status != "pending_approval":
        return jsonify({"error": "No pending penalty payment found for this loan"}), 400
        
    loan.penalty_paid = 0.0
    loan.penalty_status = "none"
    
    log = AuditLogPermanent(
        action="LOAN_PENALTY_REJECTED",
        category="loan",
        member_id=loan.member_id,
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Rejected initiated penalty payment request for Loan #{id}"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Penalty payment request rejected"}), 200

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
 
# 3. GET MY APPLICATIONS (Updated to include received_date & start_date)
@app.route("/loan-applications/my", methods=["GET"])
@jwt_required()
def get_my_applications():
    identity = get_jwt_identity()
    loans = LoanApplication.query.filter_by(member_id=identity["id"]).order_by(LoanApplication.created_at.desc()).all()
    result = []
    for l in loans:
        loan_type = LoanType.query.get(l.loan_type_id)
        guarantors = LoanGuarantor.query.filter_by(loan_id=l.id).all()
        schedule = LoanRepaymentSchedule.query.filter_by(loan_id=l.id).order_by(LoanRepaymentSchedule.installment_no).all()
        
        start_date = schedule[0].due_date if schedule else (l.created_at.strftime("%Y-%m-%d") if l.created_at else None)
        received_date = l.approved_at.strftime("%Y-%m-%d") if l.approved_at else (l.created_at.strftime("%Y-%m-%d") if l.created_at else None)

        result.append({
            "id": l.id, "amount": l.amount, "interest_rate": l.interest_rate,
            "repayment_months": l.repayment_months, "monthly_installment": l.monthly_installment,
            "total_payable": l.total_payable, "purpose": l.purpose,
            "status": l.status, "admin_notes": l.admin_notes,
            "amount_repaid": l.amount_repaid, "penalty": l.penalty,
            "balance": l.total_payable - l.amount_repaid,
            "loan_type": loan_type.name if loan_type else "Standard Loan",
            "matatu_id": l.matatu_id, "supporting_doc": l.supporting_doc,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            "received_date": received_date,
            "start_date": start_date,
            "is_preexisting": "existing" in (l.purpose or "").lower() or "onboard" in (l.purpose or "").lower(),
            "approved_at": l.approved_at.isoformat() if l.approved_at else None,
            "guarantors": [{"id": g.id, "guarantor_id": g.guarantor_id, "status": g.status} for g in guarantors],
            "schedule": [{"id": s.id, "installment_no": s.installment_no, "due_date": s.due_date,
                           "amount_due": s.amount_due, "amount_paid": s.amount_paid, "status": s.status}
                          for s in schedule],
            "rate_change_pending": getattr(l, "rate_change_pending", False),
            "rate_change_notes": getattr(l, "rate_change_notes", ""),
            "rate_commitment_status": getattr(l, "rate_commitment_status", "none"),
            # Add these two lines:
            "penalty_paid": getattr(l, "penalty_paid", 0.0),
            "penalty_status": getattr(l, "penalty_status", "none")
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
        
        # Calculate APPROVED savings only
        savings = Saving.query.filter_by(member_id=l.member_id).all()
        total_savings = sum(
            s.amount if s.transaction_type == "deposit" else -s.amount 
            for s in savings if getattr(s, "status", "approved") == "approved"
        )
        
        # Calculate general Sacco payments / Share Capital
        contributions = SaccoPayment.query.filter_by(member_id=l.member_id).all()
        total_contributions = sum(p.amount for p in contributions)

         # ALWAYS parse pending_edit outside the if/else block:
        pending_edit_val = getattr(l, "pending_edit", None)
        if isinstance(pending_edit_val, str):
                    try:
                        pending_edit_val = json.loads(pending_edit_val)
                    except Exception:
                        pending_edit_val = None
        
        # --- MULTI-FACTOR RISK ASSESSMENT ENGINE ---
        if l.status == "defaulted":
            calculated_risk = "High"  # Immediate high risk for active defaults
        else:
            risk_points = 0.0
            total_collateral_pool = total_savings + total_contributions
            
            # Check exposure relative to collateral pool
            if total_collateral_pool > 0:
                exposure_ratio = l.amount / total_collateral_pool
                if exposure_ratio > 3.0:
                    risk_points += 3.0  # High exposure (borrowed 3x more than saved)
                elif exposure_ratio > 1.5:
                    risk_points += 1.5  # Medium exposure
            else:
                risk_points += 4.0  # High risk: No savings or Sacco payments recorded
                
            # Reward successful repayments
        if l.status == "defaulted":
            calculated_risk = "High"  # Immediate high risk for active defaults
        else:
            risk_points = 0.0
            total_collateral_pool = total_savings + total_contributions
            
            if total_collateral_pool > 0:
                exposure_ratio = l.amount / total_collateral_pool
                if exposure_ratio > 3.0:
                    risk_points += 3.0
                elif exposure_ratio > 1.5:
                    risk_points += 1.5
            else:
                risk_points += 4.0
                
            if l.amount_repaid > 0 and l.total_payable > 0:
                repayment_percentage = l.amount_repaid / l.total_payable
                if repayment_percentage >= 0.50:
                    risk_points -= 1.5
                elif repayment_percentage >= 0.20:
                    risk_points -= 0.5
                    
            accepted_guarantors_count = sum(1 for g in guarantors if g.status == "accepted")
            if accepted_guarantors_count >= 2:
                risk_points -= 1.0
            elif accepted_guarantors_count == 0:
                risk_points += 1.0
                
            if risk_points >= 3.0:
                calculated_risk = "High"
            elif risk_points >= 1.5:
                calculated_risk = "Medium"
            else:
                calculated_risk = "Low"

       
        # -------------------------------------------

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
            "risk_score": calculated_risk,  # <-- Inject the new calculated risk score here
            "total_savings": total_savings, "total_contributions": total_contributions,
            "guarantors": [{"id": g.id, "guarantor_id": g.guarantor_id, "status": g.status} for g in guarantors],
            "rate_change_pending": getattr(l, "rate_change_pending", False),
            "rate_change_notes": getattr(l, "rate_change_notes", ""),
            "rate_commitment_status": getattr(l, "rate_commitment_status", "none"),
            "penalty_paid": getattr(l, "penalty_paid", 0.0),
            "penalty_status": getattr(l, "penalty_status", "none"),
            "borrower_response": getattr(l, "borrower_response", ""),
            "borrower_doc": getattr(l, "borrower_doc", ""),
            "pending_edit": pending_edit_val

        })
        
    return jsonify(result)
# ================= ADMIN: DEACTIVATE LOAN TYPE (SOFT-DELETE) WITH REPORT =================
@app.route("/loan-types/<int:id>/deactivate", methods=["PUT"])
@jwt_required()
def deactivate_loan_type(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized permission level"}), 403
        
    lt = LoanType.query.get_or_404(id)
    if not lt.is_active:
        return jsonify({"error": "This loan type is already deactivated"}), 400
        
    # Soft deactivation: hide from future applications but preserve history
    lt.is_active = False
    
    # Query all historical or current loan applications under this loan type
    loans_affected = LoanApplication.query.filter_by(loan_type_id=id).all()
    
    report_data = []
    for loan in loans_affected:
        member = Member.query.get(loan.member_id)
        report_data.append({
            "loan_id": loan.id,
            "member_id": loan.member_id,
            "member_name": member.name if member else "Unknown Member",
            "membership_no": member.membership_no if member else "N/A",
            "amount": loan.amount,
            "status": loan.status,
            "balance": round(loan.total_payable - loan.amount_repaid, 2),
            "created_at": loan.created_at.strftime("%Y-%m-%d %H:%M:%S") if loan.created_at else "N/A"
        })
        
    # Write to permanent audit log
    log = AuditLogPermanent(
        action="LOAN_TYPE_DEACTIVATED",
        category="loan",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Soft-deactivated Loan Type '{lt.name}' (ID: {id}). Generated impact report of {len(report_data)} assigned members."
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({
        "message": f"Loan type '{lt.name}' has been soft-deactivated successfully.",
        "loan_type_name": lt.name,
        "affected_loans": report_data
    }), 200


@app.route("/loan-applications/<int:id>/approve", methods=["PUT"])
@jwt_required()
def approve_application(id):
    identity = get_jwt_identity()
    loan = LoanApplication.query.get_or_404(id)
    loan_type = LoanType.query.get(loan.loan_type_id)
    
    data = request.get_json() or {}
    loan.status = "approved"
    loan.approved_by = identity["id"]
    loan.approved_at = datetime.utcnow()
    loan.admin_notes = data.get("notes", "")
    db.session.commit()

    # Determine dynamic repayment schedule parameters
    freq = getattr(loan_type, "repayment_frequency", "monthly") or "monthly"
    start_rule = getattr(loan_type, "repayment_start_rule", "next_period") or "next_period"
    start_date = datetime.utcnow()

    for i in range(1, loan.repayment_months + 1):
        # Calculate dynamic due date intervals
        step = i - 1 if start_rule == "same_day" else i
        
        if freq == "daily":
            due_date = start_date + timedelta(days=step)
        elif freq == "weekly":
            due_date = start_date + timedelta(weeks=step)
        else:  # monthly
            try:
                from dateutil.relativedelta import relativedelta
                due_date = start_date + relativedelta(months=step)
            except ImportError:
                due_date = start_date + timedelta(days=step * 30)

        schedule = LoanRepaymentSchedule(
            loan_id=loan.id, 
            installment_no=i,
            due_date=due_date.strftime("%Y-%m-%d"),
            amount_due=loan.monthly_installment
        )
        db.session.add(schedule)

    log = LoanAuditLog(loan_id=loan.id, action="APPROVED", performed_by=identity["id"], notes=data.get("notes", ""))
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Loan approved and schedule generated successfully ✓"})


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
# 4. Direct Loan Payment Route (Updated to require HR approval as well)

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

    account = LoanRepaymentAccount.query.filter_by(loan_id=loan_id).first()
    if not account:
        account = LoanRepaymentAccount(member_id=identity["id"], loan_id=loan_id, balance=0.0)
        db.session.add(account)
        db.session.commit()

    # Fixed: Removed 'member_id' argument
    txn = RepaymentAccountTransaction(
        account_id=account.id,
        amount=amount,
        transaction_type="deposit",
        payment_method=request.form.get("payment_method", "cash"),
        mpesa_code=request.form.get("mpesa_code", ""),
        description=f"Loan #{loan_id} Repayment Submission",
        date=request.form.get("date") or datetime.now().strftime("%Y-%m-%d"),
        status="pending"
    )
    db.session.add(txn)
    db.session.commit()

    return jsonify({
        "message": "Payment submitted for HR approval. Loan balance will update once confirmed.",
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

    # --- BOOKKEEPING HOOK C: ACCRUE PENALTY ASSET ---
    record_ledger_entry(
        loan_id=loan.id,
        member_id=loan.member_id,
        transaction_type="penalty_accrual",
        debit_code="1350",
        debit_name="Penalties Receivable (Asset)",
        credit_code="4200",
        credit_name="Penalty Revenue (Income)",
        amount=data["amount"],
        description=f"Manual penalty accrued on Loan #{loan.id}. Reason: {data.get('reason', '')}",
        date=datetime.utcnow().strftime("%Y-%m-%d")
    )

    identity = get_jwt_identity()
    log = LoanAuditLog(loan_id=id, action="PENALTY_ADDED", performed_by=identity["id"],
                       notes=f"KES {data['amount']} penalty: {data.get('reason', '')}")
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Penalty added"})

# ================= REPAYMENT ACCOUNT =================
# 2. Get Repayment Account & Transactions History
# 1. Get Repayment Account & History (Accessible by Borrower OR HR/Admin)
@app.route("/repayment-account/<int:loan_id>", methods=["GET"])
@jwt_required()
def get_repayment_account(loan_id):
    identity = get_jwt_identity()
    account = LoanRepaymentAccount.query.filter_by(loan_id=loan_id).first()
    
    if not account:
        return jsonify({"id": None, "balance": 0.0, "transactions": []})

    # Authorization Check: Must be HR/Director/Admin OR the borrower who owns the loan
    loan = LoanApplication.query.get(loan_id)
    if identity["role"] not in ["hr", "director", "admin"] and loan and loan.member_id != identity["id"]:
        return jsonify({"error": "Unauthorized"}), 403

    transactions = RepaymentAccountTransaction.query.filter_by(account_id=account.id).order_by(
        RepaymentAccountTransaction.created_at.desc()).all()

    return jsonify({
        "id": account.id, 
        "loan_id": loan_id,
        "balance": account.balance,
        "transactions": [{
            "id": t.id, 
            "amount": t.amount, 
            "transaction_type": t.transaction_type,
            "description": t.description, 
            "mpesa_code": t.mpesa_code,
            "payment_method": t.payment_method, 
            "date": t.date,
            "status": getattr(t, "status", "approved"),
            "created_at": t.created_at.isoformat() if hasattr(t, "created_at") and t.created_at else ""
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

# 1. Member submits repayment / top-up (Creates PENDING payment - DOES NOT update loan balance yet)
@app.route("/repayment-account/deposit", methods=["POST"])
@jwt_required()
def deposit_to_repayment_account():
    identity = get_jwt_identity()
    data = request.get_json()
    loan_id = int(data["loan_id"])
    amount = float(data["amount"])
    
    account = LoanRepaymentAccount.query.filter_by(loan_id=loan_id, member_id=identity["id"]).first()
    if not account:
        account = LoanRepaymentAccount(member_id=identity["id"], loan_id=loan_id, balance=0.0)
        db.session.add(account)
        db.session.commit()
        
    # Fixed: Removed 'member_id' argument
    txn = RepaymentAccountTransaction(
        account_id=account.id,
        amount=amount,
        transaction_type="deposit",
        payment_method=data.get("payment_method", "cash"),
        mpesa_code=data.get("mpesa_code", ""),
        description=data.get("description", f"Repayment submission for Loan #{loan_id}"),
        date=data.get("date", datetime.now().strftime("%Y-%m-%d")),
        status="pending"
    )
    db.session.add(txn)
    db.session.commit()
    return jsonify({
        "message": "Top up request submitted for HR/Admin approval", 
        "balance": account.balance
    })



# 2. HR Approval Endpoint (Updates account balance AND loan.amount_repaid ONLY now)
@app.route("/hr/repayment-transactions/<int:id>/approve", methods=["PUT"])
@jwt_required()
def approve_repayment_txn(id):
    identity = get_jwt_identity()
    txn = RepaymentAccountTransaction.query.get_or_404(id)
    
    if getattr(txn, "status", None) == "approved":
        return jsonify({"error": "Already approved"}), 400
        
    account = LoanRepaymentAccount.query.get(txn.account_id)
    if account:
        account.balance += txn.amount  # Top up confirmed
        
    txn.status = "approved"
    member_id = account.member_id if account else None
    loan_id = account.loan_id if account else None

    if loan_id:
        loan = LoanApplication.query.get(loan_id)
        if loan:
            loan.amount_repaid += txn.amount  # Decrease total balance
            
            if loan.status in ["approved", "disbursed"]:
                loan.status = "repaying"
                
            # If prepaying fully, clear the whole loan and mark all steps as paid
            if loan.amount_repaid >= loan.total_payable:
                loan.status = "cleared"
                LoanRepaymentSchedule.query.filter_by(loan_id=loan.id).update({"status": "paid"})
            else:
                # Carry-forward Spillage Logic: Distribute prepayments sequentially
                remaining_payment = txn.amount
                schedules = LoanRepaymentSchedule.query.filter_by(loan_id=loan.id).filter(
                    LoanRepaymentSchedule.status != "paid"
                ).order_by(LoanRepaymentSchedule.installment_no).all()

                for sched in schedules:
                    if remaining_payment <= 0:
                        break
                    needed = sched.amount_due - sched.amount_paid
                    if remaining_payment >= needed:
                        sched.amount_paid = sched.amount_due
                        sched.status = "paid"
                        sched.paid_at = datetime.utcnow()
                        remaining_payment -= needed
                    else:
                        sched.amount_paid += remaining_payment
                        remaining_payment = 0  # Prepayment fully allocated

            # Record Payment Confirmation Row
                    payment = LoanPayment(
                        loan_id=loan.id,
                        member_id=member_id or loan.member_id,
                        amount=txn.amount,
                        payment_method=getattr(txn, "payment_method", "cash") or "cash",
                        mpesa_code=getattr(txn, "mpesa_code", "") or "",
                        date=getattr(txn, "date", None) or datetime.now().strftime("%Y-%m-%d")
                    )
                    db.session.add(payment)

                    # --- BOOKKEEPING HOOK B: SPLIT REPAYMENT JOURNAL ---
                    interest_ratio = (loan.total_payable - loan.amount) / loan.total_payable if loan.total_payable > 0 else 0
                    interest_portion = round(txn.amount * interest_ratio, 2)
                    principal_portion = round(txn.amount - interest_portion, 2)

                    if principal_portion > 0:
                        record_ledger_entry(
                            loan_id=loan.id,
                            member_id=loan.member_id,
                            transaction_type="repayment_principal",
                            debit_code="1200",
                            debit_name="Sacco Cash/Bank Account (Asset)",
                            credit_code="1300",
                            credit_name="Loans Receivable Control (Asset)",
                            amount=principal_portion,
                            description=f"Approved principal repayment allocation on Loan #{loan.id}",
                            date=txn.date or datetime.utcnow().strftime("%Y-%m-%d")
                        )
                    if interest_portion > 0:
                        record_ledger_entry(
                            loan_id=loan.id,
                            member_id=loan.member_id,
                            transaction_type="repayment_interest",
                            debit_code="1200",
                            debit_name="Sacco Cash/Bank Account (Asset)",
                            credit_code="4100",
                            credit_name="Interest Revenue (Income)",
                            amount=interest_portion,
                            description=f"Approved interest profit allocation on Loan #{loan.id}",
                            date=txn.date or datetime.utcnow().strftime("%Y-%m-%d")
                        )

                    log_loan = LoanAuditLog(
                        loan_id=loan.id,
                        action="PAYMENT_APPROVED",
                        performed_by=identity["id"],
                        notes=f"HR approved repayment payment of KES {txn.amount:,.2f}"
                    )
                    db.session.add(log_loan)

            # Permanent Audit Log

    # Permanent Audit Log
    member = Member.query.get(member_id) if member_id else None
    log = AuditLogPermanent(
        action="REPAYMENT_PAYMENT_APPROVED",
        category="loan",
        member_id=member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Approved KES {txn.amount} repayment with carry-forward allocation for Loan #{loan_id if loan_id else 'N/A'}"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Payment approved & loan balance updated with carry-forward logic ✓"})

# 3. HR Reject Endpoint
@app.route("/hr/repayment-transactions/<int:id>/reject", methods=["PUT"])
@jwt_required()
def reject_repayment_txn(id):
    identity = get_jwt_identity()
    txn = RepaymentAccountTransaction.query.get_or_404(id)
    txn.status = "rejected"

    account = LoanRepaymentAccount.query.get(txn.account_id)
    member_id = account.member_id if account else None
    member = Member.query.get(member_id) if member_id else None

    log = AuditLogPermanent(
        action="REPAYMENT_PAYMENT_REJECTED",
        category="loan",
        member_id=member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Rejected KES {txn.amount} repayment payment"
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": "Payment rejected"})

@app.route("/admin/ledger/rebuild", methods=["POST"])
@jwt_required()
def rebuild_ledger():
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403

    try:
        LoanLedgerEntry.query.delete()
        db.session.commit()

        # 1. Disbursements
        disbursed_loans = LoanApplication.query.filter(
            LoanApplication.status.in_(["disbursed", "repaying", "cleared", "defaulted"])
        ).all()
        for l in disbursed_loans:
            date_str = l.approved_at.strftime("%Y-%m-%d") if l.approved_at else l.created_at.strftime("%Y-%m-%d") if l.created_at else datetime.utcnow().strftime("%Y-%m-%d")
            
            # --- FIX: Fetch the LoanType object cleanly to avoid AttributeError ---
            loan_type = LoanType.query.get(l.loan_type_id)
            loan_type_name = loan_type.name if loan_type else "Standard"
            
            entry = LoanLedgerEntry(
                loan_id=l.id,
                member_id=l.member_id,
                transaction_type="disbursement",
                debit_account_code="1300",
                debit_account_name="Loans Receivable Control (Asset)",
                credit_account_code="1200",
                credit_account_name="Sacco Cash/Bank Account (Asset)",
                amount=l.amount,
                description=f"Disbursement of {loan_type_name} Loan #{l.id}",
                date=date_str
            )
            db.session.add(entry)

        # 2. Repayments
        repayments = LoanPayment.query.all()
        for r in repayments:
            loan = LoanApplication.query.get(r.loan_id)
            if not loan:
                continue
            interest_ratio = (loan.total_payable - loan.amount) / loan.total_payable if loan.total_payable > 0 else 0
            interest_portion = round(r.amount * interest_ratio, 2)
            principal_portion = round(r.amount - interest_portion, 2)
            date_str = r.date or r.created_at.strftime("%Y-%m-%d") if r.created_at else datetime.utcnow().strftime("%Y-%m-%d")

            if principal_portion > 0:
                p_entry = LoanLedgerEntry(
                    loan_id=r.loan_id,
                    member_id=r.member_id,
                    transaction_type="repayment_principal",
                    debit_account_code="1200",
                    debit_account_name="Sacco Cash/Bank Account (Asset)",
                    credit_account_code="1300",
                    credit_account_name="Loans Receivable Control (Asset)",
                    amount=principal_portion,
                    description=f"Repayment Principal portion for Loan #{r.loan_id}",
                    date=date_str
                )
                db.session.add(p_entry)
            if interest_portion > 0:
                i_entry = LoanLedgerEntry(
                    loan_id=r.loan_id,
                    member_id=r.member_id,
                    transaction_type="repayment_interest",
                    debit_account_code="1200",
                    debit_account_name="Sacco Cash/Bank Account (Asset)",
                    credit_account_code="4100",
                    credit_account_name="Interest Revenue (Income)",
                    amount=interest_portion,
                    description=f"Repayment Interest portion for Loan #{r.loan_id}",
                    date=date_str
                )
                db.session.add(i_entry)

        # 3. Penalty Accruals
        audit_logs = LoanAuditLog.query.filter(LoanAuditLog.action.in_(["PENALTY_ADDED", "AUTO_DEDUCTION_FAILED"])).all()
        for log in audit_logs:
            loan = LoanApplication.query.get(log.loan_id)
            if not loan:
                continue
            amount = 0.0
            match = re.search(r"KES\s+([\d\.]+)\s+penalty", log.notes or "")
            if match:
                amount = float(match.group(1))
            else:
                match = re.search(r"Penalty\s+KES\s+([\d\.,]+)", log.notes or "", re.IGNORECASE)
                if match:
                    amount = float(match.group(1).replace(",", ""))
            if amount <= 0:
                continue
            date_str = log.created_at.strftime("%Y-%m-%d") if log.created_at else datetime.utcnow().strftime("%Y-%m-%d")
            p_entry = LoanLedgerEntry(
                loan_id=log.loan_id,
                member_id=loan.member_id,
                transaction_type="penalty_accrual",
                debit_account_code="1350",
                debit_account_name="Penalties Receivable (Asset)",
                credit_account_code="4200",
                credit_account_name="Penalty Revenue (Income)",
                amount=amount,
                description=f"Rebuilt: Accrued Penalty on Loan #{log.loan_id}. Reason: {log.notes}",
                date=date_str
            )
            db.session.add(p_entry)

        # 4. Penalty Payments
        penalty_approvals = AuditLogPermanent.query.filter_by(action="LOAN_PENALTY_APPROVED").all()
        for log in penalty_approvals:
            loan_id_match = re.search(r"Loan\s+#(\d+)", log.details or "")
            amount_match = re.search(r"Approved\s+KES\s+([\d\.,]+)\s+penalty", log.details or "")
            if not loan_id_match or not amount_match:
                continue
            l_id = int(loan_id_match.group(1))
            amt = float(amount_match.group(1).replace(",", ""))
            loan = LoanApplication.query.get(l_id)
            if not loan or amt <= 0:
                continue
            date_str = log.created_at.strftime("%Y-%m-%d") if log.created_at else datetime.utcnow().strftime("%Y-%m-%d")
            pay_entry = LoanLedgerEntry(
                loan_id=l_id,
                member_id=loan.member_id,
                transaction_type="penalty_payment",
                debit_account_code="1200",
                debit_account_name="Sacco Cash/Bank Account (Asset)",
                credit_account_code="1350",
                credit_account_name="Penalties Receivable (Asset)",
                amount=amt,
                description=f"Rebuilt: Penalty Clearance Payment of KES {amt:,.2f} on Loan #{l_id}",
                date=date_str
            )
            db.session.add(pay_entry)

        db.session.commit()
        return jsonify({"message": f"Ledger synchronized with {LoanLedgerEntry.query.count()} lines ✓"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Reconciliation failed: {str(e)}"}), 500
    
@app.route("/admin/ledger", methods=["GET"])
@jwt_required()
def get_admin_ledger():
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director", "hr"]:
        return jsonify({"error": "Unauthorized"}), 403

    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    account_code = request.args.get("account_code")
    transaction_type = request.args.get("transaction_type")

    query = LoanLedgerEntry.query

    if start_date:
        query = query.filter(LoanLedgerEntry.date >= start_date)
    if end_date:
        query = query.filter(LoanLedgerEntry.date <= end_date)
    if account_code:
        query = query.filter((LoanLedgerEntry.debit_account_code == account_code) | (LoanLedgerEntry.credit_account_code == account_code))
    if transaction_type:
        query = query.filter_by(transaction_type=transaction_type)

    entries = query.order_by(LoanLedgerEntry.date.desc(), LoanLedgerEntry.created_at.desc()).all()

    # Calculate ledger balances
    all_entries = LoanLedgerEntry.query
    if end_date:
        all_entries = all_entries.filter(LoanLedgerEntry.date <= end_date)
    all_entries = all_entries.all()

    bal_1200 = sum(e.amount for e in all_entries if e.debit_account_code == "1200") - sum(e.amount for e in all_entries if e.credit_account_code == "1200")
    bal_1300 = sum(e.amount for e in all_entries if e.debit_account_code == "1300") - sum(e.amount for e in all_entries if e.credit_account_code == "1300")
    bal_1350 = sum(e.amount for e in all_entries if e.debit_account_code == "1350") - sum(e.amount for e in all_entries if e.credit_account_code == "1350")
    bal_4100 = sum(e.amount for e in all_entries if e.credit_account_code == "4100")
    bal_4200 = sum(e.amount for e in all_entries if e.credit_account_code == "4200")

    result_entries = []
    for e in entries:
        member = Member.query.get(e.member_id)
        result_entries.append({
            "id": e.id,
            "loan_id": e.loan_id,
            "member_name": member.name if member else f"Member #{e.member_id}",
            "membership_no": member.membership_no if member else "N/A",
            "transaction_type": e.transaction_type,
            "debit_account": f"{e.debit_account_code} - {e.debit_account_name}",
            "credit_account": f"{e.credit_account_code} - {e.credit_account_name}",
            "amount": e.amount,
            "description": e.description,
            "date": e.date
        })

    return jsonify({
        "entries": result_entries,
        "balances": {
            "1200": bal_1200,
            "1300": bal_1300,
            "1350": bal_1350,
            "4100": bal_4100,
            "4200": bal_4200
        }
    }), 200

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
                        account_id=account.id,
                        amount=schedule.amount_due,
                        transaction_type="deduction",
                        description=f"Auto-deduction for loan #{loan.id} installment #{schedule.installment_no}",
                        status="approved"
                    )
                    db.session.add(txn)
                    
                    payment = LoanPayment(
                        loan_id=loan.id, member_id=loan.member_id,
                        amount=schedule.amount_due, payment_method="auto_deduction",
                        date=today
                    )
                    db.session.add(payment)

                    # --- BOOKKEEPING HOOK E1: AUTO-DEDUCTION SUCCESS ---
                    interest_ratio = (loan.total_payable - loan.amount) / loan.total_payable if loan.total_payable > 0 else 0
                    interest_portion = round(schedule.amount_due * interest_ratio, 2)
                    principal_portion = round(schedule.amount_due - interest_portion, 2)
                    
                    if principal_portion > 0:
                        record_ledger_entry(
                            loan_id=loan.id,
                            member_id=loan.member_id,
                            transaction_type="repayment_principal",
                            debit_code="1200",
                            debit_name="Sacco Cash/Bank Account (Asset)",
                            credit_code="1300",
                            credit_name="Loans Receivable Control (Asset)",
                            amount=principal_portion,
                            description=f"Auto-deduction Principal: installment #{schedule.installment_no}",
                            date=today
                        )
                    if interest_portion > 0:
                        record_ledger_entry(
                            loan_id=loan.id,
                            member_id=loan.member_id,
                            transaction_type="repayment_interest",
                            debit_code="1200",
                            debit_name="Sacco Cash/Bank Account (Asset)",
                            credit_code="4100",
                            credit_name="Interest Revenue (Income)",
                            amount=interest_portion,
                            description=f"Auto-deduction Interest: installment #{schedule.installment_no}",
                            date=today
                        )

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

                    # --- BOOKKEEPING HOOK E2: AUTO-APPLIED PENALTY ---
                    record_ledger_entry(
                        loan_id=loan.id,
                        member_id=loan.member_id,
                        transaction_type="penalty_accrual",
                        debit_code="1350",
                        debit_name="Penalties Receivable (Asset)",
                        credit_code="4200",
                        credit_name="Penalty Revenue (Income)",
                        amount=penalty_amount,
                        description=f"Auto-applied 5% default penalty on Loan #{loan.id} installment #{schedule.installment_no}",
                        date=today
                    )

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
    
    # HR initiates as "pending_approval", while Admin/Director immediately "approved"
    initial_status = "pending_approval"
    if identity["role"] in ["admin", "director"]:
        initial_status = "approved"

    payment = SalaryPayment(
        member_id=data["member_id"],
        amount=data["amount"],
        payment_type=data["payment_type"],
        period=data["period"],
        payment_method=data.get("payment_method", "cash"),
        mpesa_code=data.get("mpesa_code", ""),
        notes=data.get("notes", ""),
        paid_by=identity["id"],
        status=initial_status
    )
    db.session.add(payment)
    db.session.commit()

    member = Member.query.get(data["member_id"])
    
    action_label = "SALARY_INITIATED" if initial_status == "pending_approval" else "SALARY_PAID"
    log = AuditLogPermanent(
        action=action_label,
        category="worker",
        member_id=data["member_id"],
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Initiated KES {data['amount']} ({data['payment_type']}) period: {data['period']} - Status: {initial_status}"
    )
    db.session.add(log)
    db.session.commit()

    # Send SMS notification immediately only if pre-approved by Admin/Director
    if initial_status == "approved" and member and member.phone:
        try:
            sms.send(
                f"✅ Salary Payment: KES {data['amount']} for period {data['period']} has been disbursed via {data.get('payment_method','cash')}. - SACCO HR",
                [member.phone]
            )
        except Exception as e:
            print("SMS error:", e)

    return jsonify({"message": f"Salary payment {initial_status}", "id": payment.id, "status": initial_status}), 201

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
            "status": getattr(p, "status", "approved") or "approved", # Default to approved for legacy data
            "created_at": p.created_at.isoformat()
        })
    return jsonify(result)
# ================= ADMIN: TWO-TIER SALARY APPROVALS =================
@app.route("/salary/payments/<int:id>/approve", methods=["PUT"])
@jwt_required()
def approve_salary_payment(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director"]:
        return jsonify({"error": "Only Administrators or Directors can authorize initiated salary payments"}), 403
        
    payment = SalaryPayment.query.get_or_404(id)
    if getattr(payment, "status", "approved") == "approved":
        return jsonify({"error": "This salary payment has already been authorized"}), 400
        
    payment.status = "approved"
    db.session.commit()
    
    member = Member.query.get(payment.member_id)
    if member and member.phone:
        try:
            sms.send(
                f"✅ Salary Approved: KES {payment.amount} for period {payment.period} via {payment.payment_method}. - SACCO",
                [member.phone]
            )
        except Exception as e:
            print("SMS error:", e)
            
    log = AuditLogPermanent(
        action="SALARY_PAYMENT_APPROVED",
        category="worker",
        member_id=payment.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Approved initiated salary payment of KES {payment.amount} for {payment.period}"
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({"message": "Salary payment approved and disbursed successfully", "status": "approved"}), 200


@app.route("/salary/payments/<int:id>/reject", methods=["PUT"])
@jwt_required()
def reject_salary_payment(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["admin", "director"]:
        return jsonify({"error": "Only Administrators or Directors can reject initiated salary payments"}), 403
        
    payment = SalaryPayment.query.get_or_404(id)
    if getattr(payment, "status", "approved") == "approved":
        return jsonify({"error": "Disbursed and approved payments cannot be rejected"}), 400
        
    payment.status = "rejected"
    db.session.commit()
    
    member = Member.query.get(payment.member_id)
    log = AuditLogPermanent(
        action="SALARY_PAYMENT_REJECTED",
        category="worker",
        member_id=payment.member_id,
        membership_no=member.membership_no if member else "",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Rejected initiated salary payment of KES {payment.amount} for {payment.period}"
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({"message": "Salary payment rejected", "status": "rejected"}), 200

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
# @app.route("/loan-applications/<int:id>/respond-info", methods=["PUT"])
# @jwt_required()
# def respond_to_info_request(id):
#     identity = get_jwt_identity()
#     loan = LoanApplication.query.get_or_404(id)
#     if loan.member_id != identity["id"]:
#         return jsonify({"error": "Unauthorized"}), 403
#     data = request.get_json()
#     loan.borrower_response = data.get("response","")
#     loan.status = "pending"  # re-submit for review
#     log = LoanAuditLog(loan_id=id, action="BORROWER_INFO_SUBMITTED",
#                        performed_by=identity["id"], notes=data.get("response",""))
#     db.session.add(log)
#     db.session.commit()
#     return jsonify({"message": "Response submitted, loan back under review"})

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
# ================= MEMBER FINANCIAL STATEMENT / PAYMENT TRACKER =================
@app.route("/members/<int:member_id>/statement", methods=["GET"])
@jwt_required()
def get_member_statement(member_id):
    identity = get_jwt_identity()
    
    # Security Check: Allow HR/Director/Admin OR the member themselves
    if identity["role"] not in ["hr", "director", "admin"] and identity["id"] != member_id:
        return jsonify({"error": "Unauthorized"}), 403

    member = Member.query.get_or_404(member_id)
    statement = []

    # 1. Sacco Contributions & Welfare
    sacco_payments = SaccoPayment.query.filter_by(member_id=member_id).all()
    for sp in sacco_payments:
        statement.append({
            "id": f"sacco-{sp.id}",
            "category": "Sacco Contribution",
            "type": sp.payment_type or "Contribution",
            "amount": sp.amount,
            "date": sp.date or (sp.created_at.strftime("%Y-%m-%d") if hasattr(sp, "created_at") and sp.created_at else "N/A"),
            "method": "Direct",
            "reference": sp.notes or "",
            "status": "approved",
            "created_at": sp.created_at.isoformat() if hasattr(sp, "created_at") and sp.created_at else ""
        })

    # 2. Savings (Deposits & Withdrawals)
    savings = Saving.query.filter_by(member_id=member_id).all()
    for s in savings:
        is_deposit = s.transaction_type == "deposit"
        statement.append({
            "id": f"saving-{s.id}",
            "category": "Savings",
            "type": "Deposit" if is_deposit else "Withdrawal",
            "amount": s.amount if is_deposit else -s.amount,
            "date": s.date or (s.created_at.strftime("%Y-%m-%d") if hasattr(s, "created_at") and s.created_at else "N/A"),
            "method": "Savings Account",
            "reference": s.description or "",
            "status": "approved",
            "created_at": s.created_at.isoformat() if hasattr(s, "created_at") and s.created_at else ""
        })

    # 3. Direct Loan Repayments
    loan_payments = LoanPayment.query.filter_by(member_id=member_id).all()
    for lp in loan_payments:
        statement.append({
            "id": f"loan-pay-{lp.id}",
            "category": "Loan Repayment",
            "type": f"Loan #{lp.loan_id} Repayment",
            "amount": lp.amount,
            "date": lp.date or (lp.created_at.strftime("%Y-%m-%d") if hasattr(lp, "created_at") and lp.created_at else "N/A"),
            "method": lp.payment_method or "Cash",
            "reference": lp.mpesa_code or "",
            "status": "approved",
            "created_at": lp.created_at.isoformat() if hasattr(lp, "created_at") and lp.created_at else ""
        })

    # 4. Repayment Account Top-ups & Deductions
    txns = RepaymentAccountTransaction.query.filter_by(member_id=member_id).all() if hasattr(RepaymentAccountTransaction, 'member_id') else []
    for t in txns:
        is_deposit = t.transaction_type == "deposit"
        statement.append({
            "id": f"repay-acc-{t.id}",
            "category": "Repayment Account",
            "type": "Top Up" if is_deposit else "Deduction",
            "amount": t.amount if is_deposit else -t.amount,
            "date": t.date or (t.created_at.strftime("%Y-%m-%d") if hasattr(t, "created_at") and t.created_at else "N/A"),
            "method": t.payment_method or "M-Pesa/Cash",
            "reference": t.mpesa_code or t.description or "",
            "status": getattr(t, "status", "approved"),
            "created_at": t.created_at.isoformat() if hasattr(t, "created_at") and t.created_at else ""
        })

    # Sort statement chronologically (Newest first)
    statement.sort(key=lambda x: (x["date"] or "", x["created_at"] or ""), reverse=True)

    totals = {
        "sacco_contributions": sum(sp.amount for sp in sacco_payments),
        "total_savings": sum(s.amount if s.transaction_type == "deposit" else -s.amount for s in savings),
        "loan_repayments": sum(lp.amount for lp in loan_payments),
        "repayment_account_deposits": sum(t.amount for t in txns if t.transaction_type == "deposit" and getattr(t, "status", "approved") == "approved")
    }

    return jsonify({
        "member": {
            "id": member.id,
            "name": member.name,
            "membership_no": member.membership_no,
            "phone": member.phone,
            "role": member.role
        },
        "totals": totals,
        "statement": statement
    })

# ================= STAGE OPERATOR & VEHICLE PERFORMANCE =================
# ================= MEMBERS FALLBACK ROUTE =================
@app.route("/members", methods=["GET"])
@jwt_required()
def get_all_active_members():
    members = Member.query.filter_by(is_active=True).all()
    return jsonify([{
        "id": m.id,
        "name": m.name,
        "membership_no": m.membership_no,
        "national_id": m.national_id,  # ✅ ADD THIS LINE
        "phone": m.phone,
        "role": m.role,
        "is_active": m.is_active
    } for m in members])

# ================= STAGE OPERATOR & COMPLIANCE ROUTES =================

@app.route("/receipts/check-vehicle-trips", methods=["GET"])
@jwt_required()
def check_vehicle_trips():
    plate = request.args.get("plate", "").strip().upper()
    date_filter = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    
    if not plate:
        return jsonify({"error": "Plate number required"}), 400
        
    # Case-insensitive and trimmed lookup for submitted receipts today
    receipts = Receipt.query.filter(
        db.func.upper(db.func.trim(Receipt.plate)) == plate,
        Receipt.date_issued == date_filter,
        Receipt.is_submitted == True
    ).all()
    
    return jsonify({
        "plate": plate,
        "date": date_filter,
        "trip_count": len(receipts),
        "is_first_trip": len(receipts) == 0
    })

@app.route("/stage/penalties-all", methods=["GET"])
@jwt_required()
def get_all_stage_penalties():
    penalties = PenaltyLog.query.order_by(PenaltyLog.created_at.desc()).all()
    result = []
    now = datetime.utcnow()
    
    for p in penalties:
        remaining_days = 0
        if p.action_type == "Suspend" and not p.is_lifted and p.suspension_started_at:
            # 24-hour countdown calculation
            elapsed_hours = (now - p.suspension_started_at).total_seconds() / 3600
            days_passed = int(elapsed_hours // 24)
            remaining_days = max(0, p.suspension_days - days_passed)
            
            # Auto-lift if countdown hits 0
            if remaining_days == 0:
                p.is_lifted = True
                m = Member.query.get(p.member_id)
                if m:
                    m.is_suspended = False
                db.session.commit()

        result.append({
            "id": p.id,
            "member_id": p.member_id,
            "member_name": p.member_name,
            "membership_no": p.membership_no,
            "role": p.role,
            "mistake": p.mistake,
            "action_type": p.action_type,
            "amount_paid": p.amount_paid,
            "suspension_days": p.suspension_days, # Original action token
            "remaining_days": remaining_days,       # Dynamic 24h countdown
            "is_lifted": p.is_lifted,
            "date": p.date,
            "created_at": p.created_at.isoformat() if p.created_at else ""
        })
        
    return jsonify(result)

@app.route("/stage/check-trip", methods=["GET"])
@jwt_required()
def stage_check_trip():
    plate = request.args.get("plate", "").strip().upper()
    date_filter = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    receipts = Receipt.query.filter_by(plate=plate, date_issued=date_filter, is_submitted=True).all()
    return jsonify({
        "plate": plate,
        "date": date_filter,
        "trip_count": len(receipts),
        "is_first_trip": len(receipts) == 0
    })

@app.route("/stage/delivery-summary", methods=["GET"])
@jwt_required()
def stage_delivery_summary():
    date_filter = request.args.get("date", datetime.now().strftime("%Y-%m-%d"))
    receipts = Receipt.query.filter_by(date_issued=date_filter, is_submitted=True).all()
    by_route = {}
    vehicle_map = {}
    for r in receipts:
        route_key = f"{r.from_stage} → {r.to_stage}"
        if route_key not in by_route:
            by_route[route_key] = {"count": 0, "total": 0.0}
        by_route[route_key]["count"] += 1
        by_route[route_key]["total"] += r.shimo_fee
        
        plate = r.plate or "UNKNOWN"
        if plate not in vehicle_map:
            vehicle_map[plate] = {"plate": plate, "trips_count": 0, "amount_collected": 0.0}
        vehicle_map[plate]["trips_count"] += 1
        vehicle_map[plate]["amount_collected"] += r.shimo_fee
        
    return jsonify({
        "date": date_filter,
        "total_vehicles": len(vehicle_map),
        "total_trips": len(receipts),
        "total_amount": sum(r.shimo_fee for r in receipts),
        "by_route": by_route,
        "vehicles": list(vehicle_map.values())
    })

@app.route("/stage/vehicle-performance", methods=["GET"])
@jwt_required()
def stage_vehicle_performance():
    """Fetches comprehensive trip performance, receipts, and delivery fees for a plate & date"""
    plate = request.args.get("plate", "").strip().upper()
    date_filter = request.args.get("date") # Optional date filter
    
    if not plate:
        return jsonify({"error": "Plate is required"}), 400
        
    query = Receipt.query.filter_by(plate=plate, is_submitted=True)
    if date_filter:
        query = query.filter_by(date_issued=date_filter)
        
    receipts = query.order_by(Receipt.date_issued.desc(), Receipt.time_issued.desc()).all()
    
    return jsonify({
        "plate": plate,
        "date_filtered": date_filter or "All Time",
        "total_trips": len(receipts),
        "total_collected": sum(r.shimo_fee for r in receipts),
        "trips": [{
            "id": r.id,
            "ticket_number": r.ticket_number,
            "shimo_fee": r.shimo_fee,
            "route": f"{r.from_stage} → {r.to_stage}",
            "mode_of_payment": r.mode_of_payment,
            "date_issued": r.date_issued,
            "time_issued": r.time_issued
        } for r in receipts]
    })

@app.route("/stage/expenses", methods=["POST"])
@jwt_required()
def record_stage_expense():
    data = request.get_json()
    expense = StageExpense(
        type=data.get("type"),
        amount=float(data.get("amount", 0)),
        source_account=data.get("source_account"),
        description=data.get("description", ""),
        split_breakdown=data.get("split_breakdown"),
        date=data.get("date", datetime.now().strftime("%Y-%m-%d"))
    )
    db.session.add(expense)
    db.session.commit()
    return jsonify({"message": "Expense recorded successfully", "id": expense.id}), 201

@app.route("/stage/penalties", methods=["POST"])
@jwt_required()
def record_stage_penalty():
    data = request.get_json()
    member_id = int(data.get("member_id"))
    action_type = data.get("action_type")
    suspension_days = int(data.get("suspension_days") or 0)
    mistake = data.get("mistake")
    
    penalty = PenaltyLog(
        member_id=member_id,
        member_name=data.get("member_name"),
        membership_no=data.get("membership_no"),
        role=data.get("role"),
        mistake=mistake,
        action_type=action_type,
        amount_paid=float(data.get("amount_paid") or 0),
        suspension_days=suspension_days, # Original Action Taken preserved
        suspension_started_at=datetime.utcnow(),
        is_lifted=False,
        date=data.get("date", datetime.now().strftime("%Y-%m-%d"))
    )
    db.session.add(penalty)
    
    if action_type == "Suspend":
        member = Member.query.get(member_id)
        if member:
            member.is_suspended = True
            member.suspension_reason = f"Suspended for {suspension_days} day(s). Reason: {mistake}"
            
    db.session.commit()
    return jsonify({"message": "Penalty logged successfully", "id": penalty.id}), 201



@app.route("/hr/members/<int:id>/lift-suspension", methods=["PUT"])
@jwt_required()
def lift_suspension(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["hr", "admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    member = Member.query.get_or_404(id)
    member.is_suspended = False
    member.suspension_reason = None
    db.session.commit()

      # Mark penalty log as lifted
    penalties = PenaltyLog.query.filter_by(member_id=id, is_lifted=False).all()
    for p in penalties:
        p.is_lifted = True
        
    db.session.commit()
    return jsonify({"message": f"Suspension lifted for {member.name} ✓"})

    # Log permanently
    log = AuditLogPermanent(
        action="SUSPENSION_LIFTED",
        category="hr",
        member_id=member.id,
        membership_no=member.membership_no,
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=f"Suspension lifted for {member.name}"
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({"message": f"Suspension lifted for {member.name} ✓"})
@app.route("/stage/penalties/<int:id>", methods=["DELETE"])
@jwt_required()
def delete_lifted_penalty(id):
    identity = get_jwt_identity()
    if identity["role"] not in ["hr", "admin", "director"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    penalty = PenaltyLog.query.get_or_404(id)
    if not penalty.is_lifted:
        return jsonify({"error": "Cannot delete an active suspension record. Lift suspension first."}), 400
        
    db.session.delete(penalty)
    db.session.commit()
    return jsonify({"message": "Lifted suspension record deleted permanently ✓"})
   
@app.route("/stage/casual-payments", methods=["GET", "POST"])
@jwt_required()
def manage_casual_payments():
    if request.method == "POST":
        data = request.get_json()
        casual = CasualPayment(
            recipient_name=data.get("recipient_name"),
            amount=float(data.get("amount", 0)),
            source_account=data.get("source_account"),
            reason=data.get("reason", ""),
            date=data.get("date", datetime.now().strftime("%Y-%m-%d"))
        )
        db.session.add(casual)
        db.session.commit()
        return jsonify({"message": "Casual payment saved in internal vault", "id": casual.id}), 201
    
    payments = CasualPayment.query.order_by(CasualPayment.created_at.desc()).all()
    return jsonify([{
        "id": c.id,
        "recipient_name": c.recipient_name,
        "amount": c.amount,
        "source_account": c.source_account,
        "reason": c.reason,
        "date": c.date
    } for c in payments])

@app.route("/stage/attendance-report", methods=["POST"])
@jwt_required()
def stage_attendance_report():
    identity = get_jwt_identity()
    data = request.get_json()
    date_str = data.get("date")
    absent_count = data.get("absent_count", 0)
    attendance_records = data.get("attendance", [])
    
    absentees = [a["name"] for a in attendance_records if a.get("status") == "Absent"]
    details_str = f"Date: {date_str}. Total Absentees: {absent_count}. Absent Members: {', '.join(absentees) if absentees else 'None'}"
    
    log = AuditLogPermanent(
        action="STAGE_ATTENDANCE_SUBMITTED",
        category="hr",
        performed_by_id=identity["id"],
        performed_by_name=identity["name"],
        performed_by_role=identity["role"],
        details=details_str
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"message": f"Attendance registered. {absent_count} absence notifications flagged."})
@app.route("/matatus/plates", methods=["GET"])
@jwt_required()
def get_matatu_plates():
    """Returns a simple list of all registered matatu plates for dropdown selectors"""
    matatus = Matatu.query.all()
    return jsonify([{"id": m.id, "plate": m.plate} for m in matatus])

# ================= STAGE EXPENSES MANAGEMENT =================

@app.route("/stage/expenses/draft", methods=["POST"])
@jwt_required()
def save_stage_expense_draft():
    identity = get_jwt_identity()
    data = request.get_json()
    
    expense = StageExpense(
        matatu_plate=data.get("matatu_plate", "").strip().upper(),
        type=data.get("expense_type") or data.get("type"),
        amount=float(data.get("total_amount") or data.get("amount", 0)),
        source_account=data.get("source_account"),
        description=data.get("description", ""),
        split_breakdown=data.get("split_breakdown"),
        date=data.get("date", datetime.now().strftime("%Y-%m-%d")),
        is_submitted=False,
        recorded_by=identity["id"]
    )
    db.session.add(expense)
    db.session.commit()
    return jsonify({"message": "Expense draft saved successfully", "id": expense.id}), 201

@app.route("/stage/expenses/<int:id>/submit", methods=["PUT"])
@jwt_required()
def submit_stage_expense(id):
    identity = get_jwt_identity()
    expense = StageExpense.query.get_or_404(id)
    
    if getattr(expense, "is_submitted", False):
        return jsonify({"error": "Expense is already submitted and locked"}), 400
        
    expense.is_submitted = True
    
    # If it's a Police Fee split, route the welfare portion into the Welfare Ledger
    split = expense.split_breakdown
    if split and isinstance(split, dict) and "welfare_pool" in split:
        welfare_amt = float(split["welfare_pool"])
        if welfare_amt > 0:
            welfare_txn = WelfareLedger(
                type="Inflow",
                recipient_or_source=f"Police Fee Split ({expense.matatu_plate})",
                amount=welfare_amt,
                reason="Automatic 50 KES allocation from police collection",
                date=expense.date
            )
            db.session.add(welfare_txn)

    db.session.commit()
    return jsonify({"message": "Expense permanently submitted, locked, and splits processed ✓"})

@app.route("/stage/expenses", methods=["GET"])
@jwt_required()
def get_stage_expenses():
    date_filter = request.args.get("date")
    query = StageExpense.query
    if date_filter:
        query = query.filter_by(date=date_filter)
    expenses = query.order_by(StageExpense.created_at.desc()).all()
    
    return jsonify([{
        "id": e.id,
        "matatu_plate": e.matatu_plate,
        "type": e.type,
        "amount": e.amount,
        "source_account": e.source_account,
        "description": e.description,
        "split_breakdown": e.split_breakdown,
        "date": e.date,
        "is_submitted": getattr(e, "is_submitted", True),
        "created_at": e.created_at.isoformat() if e.created_at else ""
    } for e in expenses])
# ================= ISOLATED WELFARE WALLET LEDGER =================

@app.route("/stage/welfare-ledger", methods=["GET", "POST"])
@jwt_required()
def manage_welfare_ledger():
    if request.method == "POST":
        data = request.get_json()
        txn = WelfareLedger(
            type=data.get("type"), # 'Inflow' or 'Payout'
            recipient_or_source=data.get("recipient_or_source"),
            amount=float(data.get("amount", 0)),
            reason=data.get("reason", ""),
            date=data.get("date", datetime.now().strftime("%Y-%m-%d"))
        )
        db.session.add(txn)
        db.session.commit()
        return jsonify({"message": "Welfare transaction saved successfully", "id": txn.id}), 201

    txns = WelfareLedger.query.order_by(WelfareLedger.created_at.desc()).all()
    
    # Calculate live balance: Inflows add (+), Payouts subtract (-)
    balance = sum(t.amount if t.type == "Inflow" else -t.amount for t in txns)
    
    return jsonify({
        "balance": balance,
        "transactions": [{
            "id": t.id,
            "type": t.type,
            "recipient_or_source": t.recipient_or_source,
            "amount": t.amount,
            "reason": t.reason,
            "date": t.date,
            "created_at": t.created_at.isoformat() if t.created_at else ""
        } for t in txns]
    })
# ================= NOTIFICATIONS =================
@app.route("/notifications", methods=["GET"])      # 👈 ADD THIS LINE
@app.route("/notifications/my", methods=["GET"])
@jwt_required()
def get_my_notifications():
    identity = get_jwt_identity()
    user_id = identity.get("id")
    
    notes = Notification.query.filter_by(recipient_id=user_id).order_by(Notification.id.desc()).limit(40).all()
    
    result = []
    for n in notes:
        # Prevent AttributeError if created_at is None
        created_at_str = n.created_at.isoformat() if getattr(n, "created_at", None) else datetime.utcnow().isoformat()
        result.append({
            "id": n.id,
            "type": n.type or "general",
            "title": n.title or "Notification",
            "message": n.message or "",
            "sender_name": n.sender_name or "System",
            "is_read": bool(n.is_read),
            "created_at": created_at_str
        })
        
    return jsonify(result), 200

@app.route("/notifications/<int:id>/read", methods=["PUT"])
@jwt_required()
def mark_notification_read(id):
    identity = get_jwt_identity()
    note = Notification.query.filter_by(id=id, recipient_id=identity["id"]).first_or_404()
    note.is_read = True
    db.session.commit()
    return jsonify({"message": "Read"})

@app.route("/notifications/read-all", methods=["PUT"])
@jwt_required()
def mark_all_notifications_read():
    identity = get_jwt_identity()
    Notification.query.filter_by(recipient_id=identity["id"], is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"message": "All read"})

# ================= RUN =================
if __name__ == "__main__":
    app.run(debug=True)
