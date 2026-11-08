from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db

# ================= MEMBER MODEL =================
class Member(db.Model):
    __tablename__ = "member"

    id = db.Column(db.Integer, primary_key=True)
    membership_no = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    national_id = db.Column(db.String(20), unique=True)
    phone = db.Column(db.String(20))
    role = db.Column(db.String(50), default="member")
    password_hash = db.Column(db.String(255), nullable=True)
    google_id = db.Column(db.String(255), unique=True, nullable=True)
    is_active = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_suspended = db.Column(db.Boolean, default=False)
    suspension_reason = db.Column(db.String(255), nullable=True)

    # RELATIONSHIPS
    matatus = db.relationship("Matatu", backref="owner", lazy=True)
    payments = db.relationship("Payment", backref="member", cascade="all, delete", lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# ================= MATATU MODEL =================
class Matatu(db.Model):
    __tablename__ = "matatu"

    id = db.Column(db.Integer, primary_key=True)
    plate = db.Column(db.String(50), unique=True, nullable=False)
    owner_member_no = db.Column(db.String(50), db.ForeignKey("member.membership_no"), nullable=False)
    driver_name = db.Column(db.String(100))
    driver_id = db.Column(db.String(50))
    conductor_id = db.Column(db.String(50))
    route_id = db.Column(db.Integer, db.ForeignKey("route.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # RELATIONSHIPS
    documents = db.relationship("Document", backref="matatu", cascade="all, delete", lazy=True)
    tickets = db.relationship("Ticket", backref="matatu", cascade="all, delete", lazy=True)
    progress = db.relationship("Progress", backref="matatu", cascade="all, delete", lazy=True)
    payments = db.relationship("Payment", backref="matatu", cascade="all, delete", lazy=True)

# ================= DOCUMENT MODEL =================
class Document(db.Model):
    __tablename__ = "document"

    id = db.Column(db.Integer, primary_key=True)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=False)
    number = db.Column(db.String(100))
    type = db.Column(db.String(50))
    issue = db.Column(db.String(50))
    expiry = db.Column(db.String(50))
    file = db.Column(db.String(300))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= TICKET MODEL =================
class Ticket(db.Model):
    __tablename__ = "ticket"

    id = db.Column(db.Integer, primary_key=True)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=False)
    amount = db.Column(db.Integer)
    from_shimo = db.Column(db.Boolean)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= PROGRESS MODEL =================
class Progress(db.Model):
    __tablename__ = "progress"

    id = db.Column(db.Integer, primary_key=True)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=False)
    date = db.Column(db.String(50))
    earnings = db.Column(db.Float)
    expenses = db.Column(db.Float)
    savings = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= PAYMENT MODEL =================
class Payment(db.Model):
    __tablename__ = "payment"

    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=False)
    phone = db.Column(db.String(20))
    amount = db.Column(db.Float)
    transaction_id = db.Column(db.String(100))
    status = db.Column(db.String(20), default="pending")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= AUDIT LOG =================
class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(50))
    member_id = db.Column(db.Integer)
    membership_no = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# ================= ROUTE MODEL =================
class Route(db.Model):
    __tablename__ = "route"
    id = db.Column(db.Integer, primary_key=True)
    from_stage = db.Column(db.String(100), nullable=False)
    to_stage = db.Column(db.String(100), nullable=False)
    shimo_fee = db.Column(db.Float, nullable=False)                         # 1st Trip Fee (e.g. 200/300)
    subsequent_fee = db.Column(db.Float, default=100.0, nullable=False)    # 2nd+ Trip Fee (default 100)
    is_active = db.Column(db.Boolean, default=True)

# ================= SACCO SETTING =================
class SaccoSetting(db.Model):
    __tablename__ = 'sacco_settings'

    id = db.Column(db.Integer, primary_key=True)
    sacco_id = db.Column(db.Integer, unique=True, nullable=True) 
    sacco_name = db.Column(db.String(255), nullable=False, default="Default SACCO")
    location = db.Column(db.String(255), nullable=True)
    po_box = db.Column(db.String(100), nullable=True)
    phone_number = db.Column(db.String(50), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# ================= RECEIPT MODEL =================
class Receipt(db.Model):
    __tablename__ = "receipt"
    id = db.Column(db.Integer, primary_key=True)
    ticket_number = db.Column(db.String(50), unique=True, nullable=False)
    sacco_name = db.Column(db.String(100), default="Matatu SACCO")
    location = db.Column(db.String(100))
    po_box = db.Column(db.String(100))
    phone_number = db.Column(db.String(50))
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=False)
    plate = db.Column(db.String(20), nullable=False)
    owner_name = db.Column(db.String(100))
    route_id = db.Column(db.Integer, db.ForeignKey("route.id"), nullable=False)
    from_stage = db.Column(db.String(100))
    to_stage = db.Column(db.String(100))
    shimo_fee = db.Column(db.Float, nullable=False)
    capacity = db.Column(db.Integer)
    mode_of_payment = db.Column(db.String(20))
    issued_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    operator_membership_no = db.Column(db.String(50))
    date_issued = db.Column(db.String(20), nullable=False)
    time_issued = db.Column(db.String(20), nullable=False)
    is_submitted = db.Column(db.Boolean, default=False)
    admin_approved = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= ASSIGNMENT =================
class Assignment(db.Model):
    __tablename__ = "assignment"
    id = db.Column(db.Integer, primary_key=True)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=False)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    assigned_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= DAILY EARNING =================
class DailyEarning(db.Model):
    __tablename__ = "daily_earning"
    id = db.Column(db.Integer, primary_key=True)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=False)
    submitted_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    date = db.Column(db.String(20), nullable=False)
    proof_file = db.Column(db.String(300))
    notes = db.Column(db.String(300))
    is_confirmed = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= EXPENDITURE =================
class Expenditure(db.Model):
    __tablename__ = "expenditure"
    id = db.Column(db.Integer, primary_key=True)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=False)
    submitted_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(300), nullable=False)
    proof_file = db.Column(db.String(300))
    date = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= SAVING =================
# In models.py
# ================= SAVING =================
class Saving(db.Model):
    __tablename__ = 'savings'
    id = db.Column(db.Integer, primary_key=True)
    # FIX: Changed 'members.id' -> 'member.id' and 'matatus.id' -> 'matatu.id'
    member_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    matatu_id = db.Column(db.Integer, db.ForeignKey('matatu.id'), nullable=True)
    amount = db.Column(db.Float, nullable=False)
    transaction_type = db.Column(db.String(50), nullable=False, default='deposit')
    description = db.Column(db.String(255), nullable=True)
    date = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())
    
    payment_method = db.Column(db.String(50), nullable=True, default='cash')
    mpesa_code = db.Column(db.String(100), nullable=True)
    proof_file = db.Column(db.String(255), nullable=True)
    status = db.Column(db.String(50), nullable=False, default='approved')
# ================= LOAN REQUEST =================
class LoanRequest(db.Model):
    __tablename__ = "loan_request"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    reason = db.Column(db.String(300), nullable=False)
    status = db.Column(db.String(20), default="pending")
    approved_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=True)
    amount_repaid = db.Column(db.Float, default=0.0)
    monthly_installment = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    approved_at = db.Column(db.DateTime, nullable=True)

# ================= LOAN REPAYMENT =================
class LoanRepayment(db.Model):
    __tablename__ = "loan_repayment"
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey("loan_request.id"), nullable=False)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    date = db.Column(db.String(20), nullable=False)
    proof_file = db.Column(db.String(300))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= SACCO PAYMENT =================
class SaccoPayment(db.Model):
    __tablename__ = "sacco_payment"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=True)
    payment_type = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    proof_file = db.Column(db.String(300))
    date = db.Column(db.String(20), nullable=False)
    notes = db.Column(db.String(300))
    status = db.Column(db.String(50), nullable=False, default='pending') # 'pending' | 'approved' | 'rejected'
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= LOAN TYPES & APPLICATION MODELS =================
class LoanType(db.Model):
    __tablename__ = "loan_type"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    interest_rate = db.Column(db.Float, nullable=False)
    max_amount = db.Column(db.Float, nullable=False)
    min_amount = db.Column(db.Float, nullable=False)
    max_months = db.Column(db.Integer, nullable=False)
    min_months = db.Column(db.Integer, nullable=False)
    description = db.Column(db.String(300))
    is_active = db.Column(db.Boolean, default=True)
    terms_file = db.Column(db.String(500), nullable=True)
    penalty_rate = db.Column(db.Float, default=5.0)
    grace_period_days = db.Column(db.Integer, default=3)
    penalty_description = db.Column(db.String(500), default="")

class LoanApplication(db.Model):
    __tablename__ = "loan_application"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    loan_type_id = db.Column(db.Integer, db.ForeignKey("loan_type.id"), nullable=False)
    matatu_id = db.Column(db.Integer, db.ForeignKey("matatu.id"), nullable=True)
    amount = db.Column(db.Float, nullable=False)
    interest_rate = db.Column(db.Float, nullable=False)
    repayment_months = db.Column(db.Integer, nullable=False)
    monthly_installment = db.Column(db.Float, nullable=False)
    total_payable = db.Column(db.Float, nullable=False)
    purpose = db.Column(db.String(300), nullable=False)
    supporting_doc = db.Column(db.String(300))
    status = db.Column(db.String(30), default="pending")
    admin_notes = db.Column(db.String(300))
    hr_approved = db.Column(db.Boolean, default=False)
    hr_approved_at = db.Column(db.DateTime, nullable=True)
    admin_approved = db.Column(db.Boolean, default=False)
    approved_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    amount_repaid = db.Column(db.Float, default=0.0)

    # Penalty clearance
    penalty = db.Column(db.Float, default=0.0)
    penalty_paid = db.Column(db.Float, default=0.0)
    penalty_status = db.Column(db.String(20), default="none") # none, pending_approval, cleared

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    disburse_proof = db.Column(db.String(500), nullable=True)
    disburse_note = db.Column(db.String(500), nullable=True)
    rejection_reason = db.Column(db.String(500), nullable=True)
    # Document info request & member response
    info_requested_notes = db.Column(db.Text, nullable=True)
    borrower_response = db.Column(db.Text, nullable=True)
    borrower_doc = db.Column(db.String(500), nullable=True)

    is_legacy_onboarded = db.Column(db.Boolean, default=False)

    security_logbook = db.Column(db.Text)
    security_logbook_no = db.Column(db.String(50))
    security_status = db.Column(db.String(30), default="none")   # none|required|pending_approval|held|released
    security_notes = db.Column(db.Text)
    loan_form_file = db.Column(db.Text)
    insurance_file = db.Column(db.Text)
    bank_charges_amount = db.Column(db.Float, default=0.0)
    bank_charges_ref = db.Column(db.String(60))
    bank_charges_method = db.Column(db.String(20))
    requirements_status = db.Column(db.String(30), default="none")  # pending|submitted|verified|rejected
    requirements_notes = db.Column(db.Text) 

     # Borrower commitment to loan type rate modifications
    rate_change_pending = db.Column(db.Boolean, default=False)
    rate_change_notes = db.Column(db.Text, nullable=True)
    rate_commitment_status = db.Column(db.String(20), default="agreed") # agreed, pending_borrower, disagreed

    pending_edit = db.Column(db.Text, nullable=True)
    
    # Requirements & Pre-Cheque Clearances
    loan_form_file = db.Column(db.Text)
    
    insurance_file = db.Column(db.Text)                  # Proof of insurance payment
    insurance_amount = db.Column(db.Float, default=0.0)  # Amount paid for insurance
    insurance_ref = db.Column(db.String(60))             # Insurance M-Pesa / Bank ref
    
    bank_charges_amount = db.Column(db.Float, default=0.0) # Amount paid for bank recovery
    bank_charges_ref = db.Column(db.String(60))            # Bank charges ref
    bank_charges_method = db.Column(db.String(20))
    bank_charges_file = db.Column(db.Text)                 # Proof of bank charges payment
    
    cheque_no = db.Column(db.String(60))
    cheque_date = db.Column(db.String(30))
    
    requirements_status = db.Column(db.String(30), default="none")  # none|pending|submitted|verified|rejected
    requirements_notes = db.Column(db.Text)

class LoanGuarantor(db.Model):
    __tablename__ = "loan_guarantor"
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey("loan_application.id"), nullable=False)
    guarantor_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    status = db.Column(db.String(20), default="pending")
    responded_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class LoanRepaymentSchedule(db.Model):
    __tablename__ = "loan_repayment_schedule"
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey("loan_application.id"), nullable=False)
    installment_no = db.Column(db.Integer, nullable=False)
    due_date = db.Column(db.String(20), nullable=False)
    amount_due = db.Column(db.Float, nullable=False)
    amount_paid = db.Column(db.Float, default=0.0)
    status = db.Column(db.String(20), default="pending")
    paid_at = db.Column(db.DateTime, nullable=True)

class LoanPayment(db.Model):
    __tablename__ = "loan_payment"
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey("loan_application.id"), nullable=False)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(30))
    mpesa_code = db.Column(db.String(50))
    proof_file = db.Column(db.String(300))
    date = db.Column(db.String(20), nullable=False)
    recorded_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class LoanAuditLog(db.Model):
    __tablename__ = "loan_audit_log"
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, db.ForeignKey("loan_application.id"), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    performed_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    notes = db.Column(db.String(300))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class LoanRepaymentAccount(db.Model):
    __tablename__ = "loan_repayment_account"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    loan_id = db.Column(db.Integer, db.ForeignKey("loan_application.id"), nullable=False)
    balance = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class RepaymentAccountTransaction(db.Model):
    __tablename__ = "repayment_account_transaction"
    id = db.Column(db.Integer, primary_key=True)
    account_id = db.Column(db.Integer, db.ForeignKey("loan_repayment_account.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    transaction_type = db.Column(db.String(20))
    mpesa_code = db.Column(db.String(50))
    payment_method = db.Column(db.String(30))
    description = db.Column(db.String(200))
    date = db.Column(db.String(20))
    status = db.Column(db.String(20), default="pending")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class AuditLogPermanent(db.Model):
    __tablename__ = "audit_log_permanent"
    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), default="general")
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=True)
    membership_no = db.Column(db.String(50))
    performed_by_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=True)
    performed_by_name = db.Column(db.String(100))
    performed_by_role = db.Column(db.String(50))
    details = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class SalaryConfig(db.Model):
    __tablename__ = "salary_config"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), unique=True, nullable=False)
    base_salary = db.Column(db.Float, nullable=False, default=0.0)
    payment_frequency = db.Column(db.String(20), default="monthly")
    role_label = db.Column(db.String(50))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class SalaryPayment(db.Model):
    __tablename__ = "salary_payment"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    payment_type = db.Column(db.String(20), nullable=False)
    period = db.Column(db.String(50))
    payment_method = db.Column(db.String(30), default="cash")
    mpesa_code = db.Column(db.String(50))
    notes = db.Column(db.String(300))
    paid_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(50), nullable=False, default="approved")

class WorkerWarning(db.Model):
    __tablename__ = "worker_warning"
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    severity = db.Column(db.String(20), default="minor")
    reason = db.Column(db.Text, nullable=False)
    issued_by = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    is_acknowledged = db.Column(db.Boolean, default=False)
    acknowledged_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class StageExpense(db.Model):
    __tablename__ = 'stage_expense'
    id = db.Column(db.Integer, primary_key=True)
    matatu_plate = db.Column(db.String(20), nullable=True)
    type = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    source_account = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255))
    split_breakdown = db.Column(db.JSON, nullable=True)
    date = db.Column(db.String(20), nullable=False)
    is_submitted = db.Column(db.Boolean, default=False)
    recorded_by = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class WelfareLedger(db.Model):
    __tablename__ = 'welfare_ledger'
    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(20), nullable=False)          # 'Inflow' or 'Payout'
    recipient_or_source = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    reason = db.Column(db.String(255))
    date = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class PenaltyLog(db.Model):
    __tablename__ = 'penalty_log'
    id = db.Column(db.Integer, primary_key=True)
    member_id = db.Column(db.Integer, db.ForeignKey('member.id'), nullable=False)
    member_name = db.Column(db.String(100))
    membership_no = db.Column(db.String(50))
    role = db.Column(db.String(20))
    mistake = db.Column(db.String(255))
    action_type = db.Column(db.String(20))
    amount_paid = db.Column(db.Float, default=0.0)
    suspension_days = db.Column(db.Integer, default=0)
    suspension_started_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_lifted = db.Column(db.Boolean, default=False)
    date = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class CasualPayment(db.Model):
    __tablename__ = 'casual_payment'
    id = db.Column(db.Integer, primary_key=True)
    recipient_name = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    source_account = db.Column(db.String(100), nullable=False)
    reason = db.Column(db.String(255))
    date = db.Column(db.String(20), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

# ================= NOTIFICATION MODEL =================
class Notification(db.Model):
    __tablename__ = "notification"
    id = db.Column(db.Integer, primary_key=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey("member.id"), nullable=False)
    sender_name = db.Column(db.String(100), default="SACCO Administration")
    type = db.Column(db.String(50), default="loan")  # loan, warning, salary, info
    title = db.Column(db.String(150), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
# ================= LEDGER CHART OF ACCOUNTS MODEL =================
class LoanLedgerEntry(db.Model):
    __tablename__ = 'loan_ledger_entries'
    id = db.Column(db.Integer, primary_key=True)
    loan_id = db.Column(db.Integer, nullable=False)
    member_id = db.Column(db.Integer, nullable=False)
    transaction_type = db.Column(db.String(50), nullable=False)  # 'disbursement', 'repayment_principal', 'repayment_interest', 'penalty_accrual', 'penalty_payment'
    debit_account_code = db.Column(db.String(20), nullable=False)
    debit_account_name = db.Column(db.String(100), nullable=False)
    credit_account_code = db.Column(db.String(20), nullable=False)
    credit_account_name = db.Column(db.String(100), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    date = db.Column(db.String(50), nullable=False)  # YYYY-MM-DD
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

def upload_any(file):
    ft = file.content_type or ""
    up = cloudinary.uploader.upload(file, resource_type="image" if "image" in ft else "raw")
    return up["secure_url"]

def notify_roles(roles, title, message, sender="SACCO System"):
    for m in Member.query.filter(db.func.lower(Member.role).in_(roles), Member.is_active == True).all():
        db.session.add(Notification(recipient_id=m.id, sender_name=sender, type="loan",
                                    title=title, message=message))

def generate_schedule(loan):
    loan_type = LoanType.query.get(loan.loan_type_id)
    freq = getattr(loan_type, "repayment_frequency", "monthly") or "monthly"
    start_rule = getattr(loan_type, "repayment_start_rule", "next_period") or "next_period"
    start_date = datetime.utcnow()
    for i in range(1, loan.repayment_months + 1):
        step = i - 1 if start_rule == "same_day" else i
        if freq == "daily":
            due = start_date + timedelta(days=step)
        elif freq == "weekly":
            due = start_date + timedelta(weeks=step)
        else:
            try:
                from dateutil.relativedelta import relativedelta
                due = start_date + relativedelta(months=step)
            except ImportError:
                due = start_date + timedelta(days=step * 30)
        db.session.add(LoanRepaymentSchedule(
            loan_id=loan.id, installment_no=i,
            due_date=due.strftime("%Y-%m-%d"), amount_due=loan.monthly_installment))

def loan_extras(l):
    """Pre-cheque clearances and vehicle security dictionary helper."""
    return {
        "security_status": getattr(l, "security_status", "none") or "none",
        "security_logbook": getattr(l, "security_logbook", None),
        "security_logbook_no": getattr(l, "security_logbook_no", None),
        "security_notes": getattr(l, "security_notes", None),
        "requirements_status": getattr(l, "requirements_status", "none") or "none",
        "requirements_notes": getattr(l, "requirements_notes", None),
        "loan_form_file": getattr(l, "loan_form_file", None),
        "insurance_file": getattr(l, "insurance_file", None),
        "insurance_amount": getattr(l, "insurance_amount", 0) or 0,
        "insurance_ref": getattr(l, "insurance_ref", None),
        "bank_charges_amount": getattr(l, "bank_charges_amount", 0) or 0,
        "bank_charges_ref": getattr(l, "bank_charges_ref", None),
        "bank_charges_method": getattr(l, "bank_charges_method", None),
        "bank_charges_file": getattr(l, "bank_charges_file", None),
        "cheque_no": getattr(l, "cheque_no", None),
        "cheque_date": getattr(l, "cheque_date", None),
    }

def record_ledger_entry(loan_id, member_id, transaction_type, debit_code, debit_name, credit_code, credit_name, amount, description, date=None):
    if not date:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    entry = LoanLedgerEntry(
        loan_id=loan_id,
        member_id=member_id,
        transaction_type=transaction_type,
        debit_account_code=debit_code,
        debit_account_name=debit_name,
        credit_account_code=credit_code,
        credit_account_name=credit_name,
        amount=float(amount),
        description=description,
        date=date
    )
    db.session.add(entry)
