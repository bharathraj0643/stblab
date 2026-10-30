using Microsoft.Data.Sqlite;

namespace StbLab.Api.Database;

public static class DbInitializer
{
    public static string GetDatabasePath()
    {
        string labDir = Environment.GetEnvironmentVariable("STB_LAB_DIR")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "stb-lab");

        if (!Directory.Exists(labDir))
        {
            Directory.CreateDirectory(labDir);
        }

        return Path.Combine(labDir, "channels.db");
    }

    public static string GetConnectionString() => $"Data Source={GetDatabasePath()}";

    public static void Initialize()
    {
        using SqliteConnection connection = new(GetConnectionString());
        connection.Open();

        using SqliteCommand command = connection.CreateCommand();
        command.CommandText = """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS genres (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
            );

            CREATE TABLE IF NOT EXISTS channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                dummy_number INTEGER NOT NULL,
                redirect_number INTEGER NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
                updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
            );

            CREATE INDEX IF NOT EXISTS idx_channels_genre_id ON channels(genre_id);
            CREATE INDEX IF NOT EXISTS idx_channels_dummy ON channels(dummy_number);
            CREATE INDEX IF NOT EXISTS idx_channels_redirect ON channels(redirect_number);
            """;
        command.ExecuteNonQuery();

        // Seed default channels if genres table is empty
        using SqliteCommand countCmd = connection.CreateCommand();
        countCmd.CommandText = "SELECT COUNT(*) FROM genres;";
        long count = (long)(countCmd.ExecuteScalar() ?? 0L);

        if (count == 0)
        {
            SeedDefaults(connection);
        }
    }

    private static void SeedDefaults(SqliteConnection connection)
    {
        var seed = new (string Genre, (int Num, string Name)[] Channels)[]
        {
            ("Tamil", [
                (2, "Sun TV"), (15, "K TV"), (17, "Sun Life"), (20, "Adithya TV"), (25, "Kalaignar TV"),
                (27, "Jaya TV"), (29, "Makkal TV"), (35, "DD Tamil"), (38, "Vijay TV"), (42, "Colors Tamil"),
                (46, "Sony Vizha"), (50, "Vaanavil"), (53, "Zee Tamil"), (54, "Tamil Naaptol"), (55, "Vasanth TV"),
                (57, "Mega TV"), (58, "Moon TV"), (59, "Vijay Super"), (60, "D Tamil"), (62, "Tamil Cinema Club"),
                (63, "Sun Music"), (64, "Kalaignar Isai Aruvi")
            ]),
            ("Telugu", [
                (150, "Sun Gemini"), (152, "Maa TV"), (154, "Sun Gemini Movies"), (156, "ETV Telugu"),
                (158, "Sun Gemini Comedy"), (159, "DD Yadagiri"), (160, "DD Saptagiri"), (161, "Zee Telugu"),
                (162, "Sun Gemini Life"), (163, "ETV Life"), (164, "Telugu Naaptol"), (167, "Zee Cinemalu")
            ]),
            ("Kannada", [
                (250, "Sun Udaya"), (252, "Colors Kannada"), (253, "Sun Udaya Movies"), (254, "Zee Kannada"),
                (258, "Star Suvarna"), (259, "Sun Udaya Comedy"), (261, "Colors Super"), (264, "Siri Kannada"),
                (267, "Kannada Cinema Club"), (268, "DD Chandana"), (269, "Colors Kannada Cinema"),
                (270, "Star Suvarna Plus"), (280, "Zee Power"), (281, "Public Movies"), (282, "Sun Udaya Music"),
                (283, "Public Music"), (284, "TV9 Kannada"), (285, "News First"), (286, "News18 Kannada"),
                (287, "Public TV"), (288, "Asianet Suvarna News"), (289, "R.Kannada"), (290, "Power TV"),
                (291, "TV5 Kannada"), (292, "Zee Kannada News"), (293, "Freedom TV")
            ]),
        };

        int genreOrder = 1;
        foreach (var (genreName, channels) in seed)
        {
            using SqliteCommand insertGenre = connection.CreateCommand();
            insertGenre.CommandText = "INSERT INTO genres (name, sort_order) VALUES ($name, $order); SELECT last_insert_rowid();";
            insertGenre.Parameters.AddWithValue("$name", genreName);
            insertGenre.Parameters.AddWithValue("$order", genreOrder++);
            long genreId = (long)insertGenre.ExecuteScalar()!;

            int channelOrder = 1;
            foreach (var (num, name) in channels)
            {
                using SqliteCommand insertChan = connection.CreateCommand();
                insertChan.CommandText = """
                    INSERT INTO channels (genre_id, name, dummy_number, redirect_number, sort_order)
                    VALUES ($gid, $name, $dummy, $redirect, $order);
                    """;
                insertChan.Parameters.AddWithValue("$gid", genreId);
                insertChan.Parameters.AddWithValue("$name", name);
                insertChan.Parameters.AddWithValue("$dummy", num);
                insertChan.Parameters.AddWithValue("$redirect", num);
                insertChan.Parameters.AddWithValue("$order", channelOrder++);
                insertChan.ExecuteNonQuery();
            }
        }
    }
}

