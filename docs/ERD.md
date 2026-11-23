# ZamMove – Entity Relationship Diagram

Source of truth: `backend/src/state.js` (tables) and `backend/src/domain/*.js` (fields each action writes).
Every table is stored as `{ id, data }` rows (Supabase JSON or the local file store); the diagram shows the logical model inside `data`.

```mermaid
erDiagram
    USER ||--o{ APPLICATION : "applies for a role"
    USER ||--o| DRIVER_STATUS : "has (drivers)"
    USER ||--o{ VEHICLE : "owns"
    USER ||--o{ ASSIGNMENT : "is assigned (driver)"
    VEHICLE ||--o{ ASSIGNMENT : "is driven via"
    USER ||--o{ BOOKING : "books (customer)"
    USER |o--o{ BOOKING : "drives (driver)"
    VEHICLE |o--o{ BOOKING : "used for"
    BOOKING ||--o| REVIEW : "is reviewed in"
    USER ||--o{ REMITTANCE : "remits (driver)"
    REMITTANCE |o--|{ BOOKING : "settles"
    USER ||--o{ RENTAL : "rents (customer)"
    VEHICLE ||--o{ RENTAL : "is rented in"
    BOOKING ||--o{ PAYMENT : "paid by"
    RENTAL ||--o{ PAYMENT : "paid by"
    USER ||--o{ PAYMENT : "pays / receives"
    BOOKING |o--o{ INCIDENT : "reported on"
    USER ||--o{ INCIDENT : "reports"
    USER ||--o{ NOTIFICATION : "receives"
    USER ||--o{ AUDIT_LOG : "performs"

    USER {
        string em PK "email"
        string name
        string ph "PH mobile"
        string dob
        string ad "address"
        string pw "scrypt hash"
        bool ver "verified"
        json roles "customer/driver/owner + status"
        string adm "admin level, staff only"
        int tv "token version"
        datetime cr
    }
    APPLICATION {
        string id PK "AP…"
        string user FK
        string role "driver | owner"
        string st "Pending Review / Approved / Rejected"
        json info "phone, license, licExp, clrExp"
        json rec "owner recommendations"
    }
    DRIVER_STATUS {
        string em PK, FK
        string avail "Available / Unavailable"
    }
    VEHICLE {
        string id PK "VH…"
        string owner FK
        string type "tw pk l3 cv w6 / rental"
        string plate UK
        string brand
        string model
        string regExp
        json legal "CTPL + LTFRB CPC"
        string approval
        string status
        json rent "day rate, deposit"
        bool selfReq "owner drives it"
    }
    ASSIGNMENT {
        string id PK "AS…"
        string vehicle FK
        string driver FK
        string by FK
        string mode "owner invite / admin / self"
        json terms "driver % agreement"
        string st "Invited / Active / Ended"
    }
    BOOKING {
        string id PK "BK…"
        string cu FK "customer"
        string drvUser FK "driver"
        string veh FK "vehicle"
        string rem FK "remittance"
        string pu "pickup"
        string dr "drop-off"
        date dt
        string tm
        string vid "vehicle type"
        string sz "S M L XL"
        int mv "helpers"
        float km
        float tot
        string rn "recipient"
        string rph
        string st "Pending … Completed / Cancelled / Interrupted"
        json ev "status timeline"
        json split "driver / owner / ZamMove"
    }
    REVIEW {
        string id PK "RV…"
        string bid FK, UK
        string by FK
        int r "1-5 stars"
        string t "comment"
    }
    REMITTANCE {
        string id PK "RM…"
        string drv FK
        string week
        json bks "booking ids"
        float gross
        float drvShare
        float due
        float credit "cancel-fee credit"
        string st "Submitted / Verified / Rejected"
    }
    RENTAL {
        string id PK "RN…"
        string cu FK
        string veh FK
        string owner FK
        date s "start"
        date e "end"
        float tot
        float dep "deposit"
        string lic "renter license"
        string st
        json late "late fee"
        json split
    }
    PAYMENT {
        string id PK "PY…"
        string bid FK "booking OR rental id"
        string kind "down / balance / rent / cancel_fee / refund / owner_payout …"
        string method "GCash / Cash"
        float amount
        string ref
        string payer FK
        string to FK
        string status "Due / Submitted / Verified / Paid / Rejected"
    }
    INCIDENT {
        string id PK "IN…"
        string by FK
        string bid FK
        string driver FK "owner reports"
        string cat
        string sev "Low / Medium / High"
        string d "description"
        string st
        json log
    }
    NOTIFICATION {
        string id PK "NT… / SM…"
        string to FK
        string h "title"
        string b "body"
        bool r "read"
        string sim "SMS / Email when simulated"
    }
    AUDIT_LOG {
        string id PK "AU…"
        string who FK
        string evt
        json data
        datetime t
    }
    SETTINGS {
        string id PK "main"
        float comm "commission %"
        float drvPct
        float coShare
        int pendMin
        float cashCap
        json rates "fare overrides"
    }
```

## Notes for reading the diagram

- **One user, many roles.** Customer, driver and owner are not separate tables. A user's `roles` list holds each role and its status, and an `APPLICATION` row is the request to get one. Staff (admin and cashier) are users with `adm` set.
- **`PAYMENT.bid` is polymorphic.** It holds a booking id (`BK…`) or a rental id (`RN…`). Owner payouts have an empty `bid` and use `to`.
- **A booking gets its driver and vehicle when it is accepted.** `drvUser` and `veh` come from that driver's active `ASSIGNMENT`. Until then they are empty, hence the zero-or-one ends.
- **A remittance settles a week of cash trips.** `REMITTANCE.bks` lists the bookings, and each booking points back through `rem`.
- **A booking has at most one review.** The rule is enforced in `bookings.js`.
- **Embedded (not separate tables):** booking timeline `ev`, assignment and rental `hist`, vehicle `legal` and `docs`, money `split`.
- **`SETTINGS`** is a single row (`main`). Admins edit fares, commission and the driver cash limit there.
