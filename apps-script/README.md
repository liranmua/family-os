# Family OS — פרוסה אנכית (Apps Script, בלי clasp בשלב הזה)

מטרה: לוודא שה-Web App קורא וכותב לטאב `Tasks` בגיליון האמיתי, שהזהות עובדת,
ושה-HTML מתרנדר בתוך HtmlService — לפני שמעבירים את כל הדשבורד.

## התקנה ידנית (העתק/הדבק)

1. בגיליון `Family_OS_Database` → **Extensions → Apps Script** (כבר פתחת).
2. בעורך, בקובץ `Code.gs` — למחוק את `myFunction` ולהדביק את כל התוכן של [`Code.gs`](Code.gs).
3. **+** ליד "Files" → **HTML** → שם הקובץ `Index` (בלי סיומת) → למחוק את ברירת המחדל ולהדביק את [`Index.html`](Index.html).
4. **Save** (Ctrl+S) לשני הקבצים.
5. **Deploy → New deployment** → גלגל שיניים → **Web app**:
   - *Description*: `slice v1`
   - *Execute as*: **User accessing the web app**
   - *Who has access*: **Only myself**
   - **Deploy** → לאשר את הרשאות ה-OAuth (זה הגיליון שלך; אשר).
6. לפתוח את ה-**Web app URL** שקיבלת. אמורה להופיע טבלת 8 המשימות מהגיליון,
   והשורה "מחובר כ:" עם המייל שלך.

## מה לבדוק

- [ ] הטבלה נטענת עם הנתונים האמיתיים מהטאב Tasks.
- [ ] "מחובר כ:" מציג `liranmua@gmail.com`.
- [ ] הוספת משימה חדשה → מופיעה שורה חדשה **בגיליון עצמו** (טאב Tasks), עם `TSK-009`.
- [ ] עריכת משימה קיימת (שינוי סטטוס) → הערך משתנה בגיליון.
- [ ] ריענון הדף → השינויים נשארים (כי הם בגיליון, לא בזיכרון).

## עדכון קוד בשלב הזה

כל תיקון = גרסה חדשה מ-Claude → מדביק מחדש בעורך → **Save** →
**Deploy → Manage deployments → עריכה (עיפרון) → Version: New version → Deploy**.
(אותו URL נשמר.)

## סטטוס

שלב בדיקה **סולו** — הגיליון עדיין לא משותף עם מורן. שיתוף + שינוי
`Who has access` יקרו רק אחרי שהפרוסה יציבה.

## אחרי שהפרוסה עובדת ובשימוש ~שבוע

מעבר ל-clasp + git:
```
npm i -g @google/clasp
clasp login
clasp clone <SCRIPT_ID>   # ה-ID מ־Project Settings בעורך
git init
```
ומכאן Claude Code עורך את הקבצים ישירות + `clasp push`.
