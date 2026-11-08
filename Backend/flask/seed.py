from app import app
from models import db, Member

with app.app_context():
    existing = Member.query.filter_by(membership_no="ADMIN001").first()
    if existing:
        print("Admin already exists.")
    else:
        admin = Member(
            membership_no="ADMIN001",
            name="Administrator",
            national_id="ADMIN-0001",
            phone="0700000000",
            role="admin",
            is_active=True
        )
        admin.set_password("""" ChangeThisSecret2026! """")
        db.session.add(admin)
        db.session.commit()
        print("Admin created: ADMIN001")